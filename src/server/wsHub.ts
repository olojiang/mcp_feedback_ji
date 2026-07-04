/**
 * WebSocket hub: the central message router.
 *
 * Feedback sessions are keyed by conversation_id (from Cursor),
 * with fallback to project hash or auto-generated key.
 * Sessions survive transport disconnection for reconnection.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import type {
    ConversationMessage,
    WSMessage,
} from '../types';
import {
    writeServer,
    readServerByHash,
    deleteServerByHash,
    projectHash,
    cleanupStaleServers,
    readRegistryLock,
    writeRegistryLock,
    clearRegistryLock,
} from '../fileStore';
import { writeServersBatch, releaseRegistryLockIfOwner } from '../registryLock';
import { buildTransportMetrics } from '../transportMetrics';
import { FeedbackManager } from './feedbackManager';
import { PendingManager } from './pendingManager';
import { handleHttpRoute } from './httpRoutes';
import { ProjectTimeline } from './projectTimeline';
import { ClientRegistry, type ConnectedClient } from './clientRegistry';
import { FeedbackFlow } from './feedbackFlow';
import { bindClientConnectionHandlers } from './connectionHandlers';
import { findAvailablePort } from './portFinder';
import { dispatchRouteMessage } from './routeAdapter';
import { decodeWsMessage } from './wsMessageCodec';
import { createWebviewBridge, type WebviewBridge } from './webviewBridge';
import { buildHubSnapshot } from '../hubSnapshot';
import { formatDisconnectEvent } from '../disconnectReason';
import {
    evaluateBroadcastDelivery,
    sessionDisplayedLogLine,
    sessionReplayLogLine,
    sessionUpdatedLogLine,
} from '../feedbackDelivery';
import { readClipboardImageBase64 } from '../utils/clipboardImage';
import type { ClipboardPort } from '../clipboardPort.js';
import { createClipboardHandlers } from './clipboardHandlers.js';
import { getLogsDir } from '../configPaths.js';
import { hubLog, hubStructuredLog } from '../extensionFileLog.js';
import { buildStateSyncPayload, hubFingerprint, pendingSessionsFingerprint } from '../stateSyncPayload.js';
import { formatSessionLifecycleLine } from '../sessionLifecycleLog.js';
import { appendSessionJournalRecord } from '../sessionJournal.js';
import { PipelineHop, pipelineTraceLine } from '../pipelineContracts.js';
import {
    clearPersistedPendingSessions,
    isPersistedSessionExpired,
    readPersistedPendingSessions,
    writePersistedPendingSessions,
} from '../pendingSessionStore.js';

function wsLog(msg: string): void {
    hubLog(msg);
}

const PORT_RANGE_START = 48200;
const PORT_RANGE_END = 48300;
const HEARTBEAT_INTERVAL = 30_000;
const CLIENT_TIMEOUT = 90_000;
const MESSAGE_CAP = 500;

export interface WsHubOptions {
    clipboard?: ClipboardPort;
    readImageBase64?: () => Promise<string | null>;
}

export class WsHub {
    private server: http.Server | null = null;
    private wss: WebSocketServer | null = null;
    private port = 0;
    private readonly version: string;
    private readonly clients = new ClientRegistry();
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    private readonly feedback: FeedbackManager;
    private readonly pending: PendingManager;
    private readonly timeline: ProjectTimeline;
    private readonly feedbackFlow: FeedbackFlow;

    private workspaces: string[] = [];
    private readonly stateSyncGenerations = new Map<WebSocket, number>();
    private readonly stateSyncFingerprints = new Map<WebSocket, {
        pending: string;
        hub: string;
        messageCount: number;
    }>();
    private readonly clipboard: ClipboardPort;
    private readonly _readImageBase64: () => Promise<string | null>;
    private _mcpConnSeq = 0;
    private readonly _mcpConnIds = new WeakMap<WebSocket, number>();

    constructor(version = '0.0.0', options: WsHubOptions = {}) {
        this.version = version;
        this.clipboard = options.clipboard ?? {
            writeText: async () => { throw new Error('clipboard port not configured'); },
            readText: async () => '',
        };
        this._readImageBase64 = options.readImageBase64 ?? readClipboardImageBase64;
        this.feedback = new FeedbackManager();
        this.pending = new PendingManager();
        this.timeline = new ProjectTimeline(MESSAGE_CAP);
        this.feedbackFlow = new FeedbackFlow({
            feedback: this.feedback,
            getHubWorkspaces: () => this.workspaces,
            appendReminder: (feedback) => feedback,
            addMessage: (msg) => this._addMessage(msg),
            broadcastSessionUpdated: (summary, sessionId, projectDirectory, traceId) => {
                this._broadcastSessionUpdated(summary, sessionId, projectDirectory, traceId);
            },
            broadcastFeedbackSubmitted: (feedback, sessionId) => {
                this._broadcastToWebviews({
                    type: 'feedback_submitted',
                    feedback,
                    ...(sessionId ? { session_id: sessionId } : {}),
                });
            },
            clearPending: () => {
                this.pending.clear();
                this._broadcastToWebviews({ type: 'pending_synced', comments: [], images: [] });
            },
            queueAsPending: (feedback, images) => {
                const comments = feedback ? [feedback] : [];
                this.pending.set(comments, images ?? []);
                this._broadcastToWebviews({ type: 'pending_synced', comments, images: images ?? [] });
            },
            sendResult: (ws, result) => {
                if (ws.readyState !== WebSocket.OPEN) {
                    wsLog(`sendResult: skip closed ws readyState=${ws.readyState}`);
                    return;
                }
                wsLog(pipelineTraceLine(
                    PipelineHop.MCP_RESULT,
                    `session=${result.session_id ?? '-'} status=${result.status ?? 'submitted'} len=${(result.feedback || '').length}`,
                ));
                this._send(ws, {
                    type: 'feedback_result',
                    status: result.status ?? 'submitted',
                    feedback: result.feedback,
                    images: result.images,
                    ...(result.session_id ? { session_id: result.session_id } : {}),
                });
            },
            sendSessionBound: (ws, payload) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                wsLog(pipelineTraceLine(
                    PipelineHop.SESSION_BOUND,
                    `session=${payload.session_id} trace=${payload.trace_id ?? '-'}`,
                ));
                this._send(ws, {
                    type: 'session_bound',
                    session_id: payload.session_id,
                    ...(payload.trace_id ? { trace_id: payload.trace_id } : {}),
                });
            },
            sendError: (ws, error) => {
                this._send(ws, {
                    type: 'feedback_error',
                    error: error.message,
                });
            },
            onFeedbackRequested: undefined,
            onFeedbackResolved: undefined,
            log: wsLog,
            getHubMeta: () => ({ port: this.port, pid: process.pid }),
            appendSessionJournal: (record) => appendSessionJournalRecord(record),
        });

        this.pending.onPendingDelivered((delivery) => {
            this._onPendingDelivered(delivery.comments, delivery.images);
        });
    }

    // ── Public API ──────────────────────────────────────────

    setWorkspaces(workspaces: string[]): void {
        this.workspaces = workspaces;
        this.timeline.setWorkspaces(workspaces);
    }

    onFeedbackRequest(cb: () => void): void {
        this.feedbackFlow.setOnFeedbackRequested(() => {
            this._persistPendingSessions('enqueue');
            cb();
        });
    }

    onFeedbackResolved(cb: () => void): void {
        this.feedbackFlow.setOnFeedbackResolved(() => {
            if (!this.feedback.hasPending()) {
                clearPersistedPendingSessions(this.workspaces);
                wsLog('pending_persist: cleared reason=all_resolved');
            } else {
                this._persistPendingSessions('partial_resolve');
            }
            cb();
        });
    }

    onFeedbackError(cb: (reason: string) => void): void {
        this.feedbackFlow.setOnFeedbackError(cb);
    }

    getPort(): number {
        return this.port;
    }

    getConnectedClients(): { webviews: number; mcpServers: number } {
        return this.clients.counts();
    }

    /** Integration tests: run heartbeat stale sweep at a synthetic clock. */
    staleSweepAt(now: number): void {
        if (process.env.MCP_FEEDBACK_TEST_HOOKS !== '1') {
            throw new Error('staleSweepAt is test-only (set MCP_FEEDBACK_TEST_HOOKS=1)');
        }
        this.clients.sweepStale(now, CLIENT_TIMEOUT, () => { });
    }

    /** Integration tests: age a connected client's last pong. */
    setClientLastPong(ws: WebSocket, ts: number): void {
        if (process.env.MCP_FEEDBACK_TEST_HOOKS !== '1') {
            throw new Error('setClientLastPong is test-only (set MCP_FEEDBACK_TEST_HOOKS=1)');
        }
        this.clients.setLastPong(ws, ts);
    }

    getDebugInfo(): Record<string, unknown> {
        const transport = buildTransportMetrics(this.clients.transportCounts());
        return {
            hubPort: this.port,
            hubVersion: this.version,
            workspaces: this.workspaces,
            clients: this.clients.counts(),
            transportMetrics: transport,
            hasPending: this.feedback.hasPending(),
            serverListening: this.server !== null,
        };
    }

    hasPendingRequests(): boolean {
        return this.feedback.hasPending();
    }

    refreshServerRegistration(): void {
        this._registerServer();
    }

    /** In-process bridge for Cursor webview (avoids unreliable ws:// from webview sandbox). */
    attachWebview(postToPanel: (msg: Record<string, unknown>) => void): WebviewBridge {
        const bridge = createWebviewBridge(postToPanel);
        const client = this._bindClient(bridge.socket);
        client.clientType = 'webview';
        client.webviewTransport = 'bridge';
        wsLog('client registered: type=webview (bridge)');
        return bridge;
    }

    // ── Lifecycle ───────────────────────────────────────────

    async start(): Promise<number> {
        this._cleanup();

        cleanupStaleServers();

        this.port = await this._findPort();
        await this._startServer();
        this._registerServer();
        this._startHeartbeat();

        wsLog(`server started: port=${this.port} pid=${process.pid} version=${this.version} ws=${JSON.stringify(this.workspaces)}`);
        this._restorePersistedPendingSessions();
        return this.port;
    }

    async stop(): Promise<void> {
        this._cleanup();
    }

    private _cleanup(): void {
        wsLog('_cleanup: stopping hub pid=' + process.pid);
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.timeline.dispose();

        this.pending.clear();

        if (this.feedback.hasPending() || this.pending.read()) {
            this._persistPendingSessions('hub_shutdown');
        }
        this.clients.closeAll();

        this.feedback.rejectAll(new Error('Server shutting down'));

        if (this.wss) { this.wss.close(); this.wss = null; }
        if (this.server) { this.server.close(); this.server = null; }

        for (const ws of this.workspaces) {
            deleteServerByHash(projectHash(ws));
        }
        if (releaseRegistryLockIfOwner(readRegistryLock(), process.pid)) {
            clearRegistryLock();
        }
    }

    private _addMessage(msg: ConversationMessage): void {
        this.timeline.addMessage(msg);
    }

    private _persistPendingSessions(reason: string): void {
        const sessions = this.feedback.pendingSessionsForPersist().map((s) => ({
            id: s.id,
            summary: s.summary,
            projectDir: s.projectDir,
            traceId: s.traceId,
            mcpDetached: s.mcpDetached,
            enqueuedAt: s.enqueuedAt,
        }));
        const queue = this.pending.read();
        writePersistedPendingSessions(this.workspaces, sessions, {
            pendingComments: queue?.comments ?? [],
            pendingImages: queue?.images ?? [],
        });
        wsLog(
            `pending_persist: reason=${reason} count=${sessions.length}`
            + ` queue=${queue?.comments?.length ?? 0}`
            + ` sessions=${sessions.map((s) => s.id).join(',') || '-'}`,
        );
    }

    private _restorePersistedPendingSessions(): void {
        const snap = readPersistedPendingSessions(this.workspaces);
        if (!snap) return;
        const queue = snap.pendingComments?.length || snap.pendingImages?.length
            ? { comments: snap.pendingComments ?? [], images: snap.pendingImages ?? [] }
            : null;
        if (queue) {
            this.pending.set(queue.comments, queue.images);
            wsLog(
                `pending_restore: queue comments=${queue.comments.length}`
                + ` images=${queue.images.length}`,
            );
        }
        let restored = 0;
        let skipped = 0;
        for (const s of snap.sessions) {
            if (isPersistedSessionExpired(s)) {
                skipped++;
                wsLog(`pending_restore: skip session=${s.id} reason=expired`);
                continue;
            }
            const ok = this.feedback.restoreDetachedSession({
                sessionId: s.id,
                projectDir: s.projectDir,
                traceId: s.traceId,
                summary: s.summary,
                enqueuedAt: s.enqueuedAt,
            });
            if (ok) restored++;
        }
        wsLog(
            `pending_restore: restored=${restored} skipped=${skipped} savedAt=${snap.savedAt}`
            + ` sessions=${snap.sessions.map((s) => s.id).join(',')}`,
        );
        if (restored > 0) {
            for (const session of this.feedback.pendingSessions()) {
                this._broadcastSessionUpdated(
                    session.summary,
                    session.id,
                    session.projectDir,
                    session.traceId,
                );
            }
        }
    }

    // ── Server Setup ────────────────────────────────────────

    private _findPort(): Promise<number> {
        return findAvailablePort(PORT_RANGE_START, PORT_RANGE_END);
    }

    private _startServer(): Promise<void> {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => this._handleHttpRequest(req, res));
            this.wss = new WebSocketServer({ server: this.server });
            this.wss.on('connection', (ws) => this._handleConnection(ws));
            this.server.listen(this.port, '127.0.0.1', () => resolve());
        });
    }

    private _handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const handled = handleHttpRoute(req, res, {
            port: this.port,
            version: this.version,
            pending: this.pending,
            log: wsLog,
        });
        if (handled) return;

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not_found' }));
    }

    private _registerServer(): void {
        const startedAt = Date.now();
        const result = writeServersBatch({
            workspaces: this.workspaces,
            info: {
                port: this.port,
                pid: process.pid,
                version: this.version,
                started_at: startedAt,
            },
            projectHash,
            readLock: readRegistryLock,
            writeLock: writeRegistryLock,
            writeServer,
            isAlive: (pid) => {
                try {
                    process.kill(pid, 0);
                    return true;
                } catch {
                    return false;
                }
            },
        });
        if (!result.ok) {
            wsLog(`registry_write_skipped reason=${result.reason} pid=${process.pid} port=${this.port}`);
            return;
        }
        wsLog(`registry_write ok hashes=${result.hashes.join(',')} port=${this.port} pid=${process.pid}`);
    }

    // ── Connection Handling ─────────────────────────────────

    private _handleConnection(ws: WebSocket): void {
        this._bindClient(ws);
    }

    private _bindClient(ws: WebSocket): ConnectedClient {
        const client = this.clients.add(ws);

        this._send(ws, {
            type: 'connection_established',
            version: this.version,
            port: this.port,
            pid: process.pid,
            workspaces: this.workspaces,
        });
        bindClientConnectionHandlers(ws, client, {
            onParsedMessage: (raw) => {
                try {
                    this._routeMessage(ws, client, decodeWsMessage(raw));
                } catch (e) {
                    wsLog(`protocol_parse_error: ${e instanceof Error ? e.message : String(e)}`);
                }
            },
            onDisconnect: () => {
                const detached = this.feedback.detachMcpClient(ws);
                const mcpConnId = this._mcpConnIds.get(ws);
                if (detached.length) {
                    wsLog(`mcp disconnected: ${formatDisconnectEvent('extension_ws_close', {
                        sessions: detached.join(','),
                    })}`);
                    wsLog(formatSessionLifecycleLine({
                        event: 'mcp_detach',
                        mcpConnId,
                        detail: detached.join(','),
                        pendingCount: this.feedback.pendingCount(),
                    }));
                    this._persistPendingSessions('mcp_detach');
                }
                this.clients.remove(ws);
                this.stateSyncGenerations.delete(ws);
                this.stateSyncFingerprints.delete(ws);
            },
        });
        return client;
    }

    private _clipboardHandlers: ReturnType<typeof createClipboardHandlers> | null = null;
    private _getClipboardHandlers() {
        if (!this._clipboardHandlers) {
            this._clipboardHandlers = createClipboardHandlers({
                clipboard: this.clipboard,
                readImageBase64: this._readImageBase64,
                log: wsLog,
                send: (targetWs, data) => this._send(targetWs, data),
            });
        }
        return this._clipboardHandlers;
    }

    private _routeMessage(ws: WebSocket, client: ConnectedClient, msg: WSMessage): void {
        const clipboardHandlers = this._getClipboardHandlers();
        dispatchRouteMessage(ws, client, msg, {
            onRegister: (clientType) => {
                client.clientType = clientType;
                if (clientType === 'webview' && !client.webviewTransport) {
                    client.webviewTransport = 'tcp';
                }
                wsLog(`client registered: type=${client.clientType} transport=${client.webviewTransport || '-'}`);
                if (clientType === 'mcp-server') {
                    const connId = ++this._mcpConnSeq;
                    this._mcpConnIds.set(ws, connId);
                    wsLog(formatSessionLifecycleLine({
                        event: 'mcp_connect',
                        mcpConnId: connId,
                        mcpReadyState: ws.readyState,
                        pendingCount: this.feedback.pendingCount(),
                        reason: 'mcp_ws_registered',
                    }));
                }
                if (clientType === 'webview') {
                    this._replayPendingSessions(ws);
                }
            },
            onFeedbackRequest: (mcpWs, req) => this._handleFeedbackRequest(mcpWs, req),
            onFeedbackResponse: (res) => this._handleFeedbackResponse(res),
            onQueuePending: (qp) => this._handleQueuePending(qp),
            onDismiss: () => this._handleDismiss(),
            onGetState: (targetWs) => this._sendState(targetWs),
            onSessionDisplayed: (sessionId) => {
                const snap = this.feedback.pendingSessions().find((s) => s.id === sessionId);
                wsLog(sessionDisplayedLogLine(sessionId, snap?.projectDir, snap?.traceId));
            },
            onClipboardWrite: (targetWs, clipMsg) => {
                clipboardHandlers.onClipboardWrite(targetWs, clipMsg);
            },
            onClipboardPaste: (targetWs, clipMsg) => {
                void clipboardHandlers.onClipboardPaste(targetWs, clipMsg);
            },
            sendPong: (targetWs) => this._send(targetWs, {
                type: 'pong',
                body: 'pong',
                hub: this._hubSnapshot(),
            }),
            onProtocolError: (context) => {
                wsLog(`protocol_error: ${context} client=${client.clientType}`);
                this._send(ws, {
                    type: 'protocol_error',
                    error: `Invalid message: ${context}`,
                });
            },
        });
    }

    // ── Feedback Flow ───────────────────────────────────────

    private _handleFeedbackRequest(
        mcpWs: WebSocket,
        req: { summary: string; project_directory?: string; trace_id?: string },
    ): void {
        this.feedbackFlow.handleFeedbackRequest(mcpWs, req);
    }

    private _handleFeedbackResponse(res: { feedback: string; images?: string[]; session_id?: string }): void {
        this.feedbackFlow.handleFeedbackResponse(res);
    }

    private _handleDismiss(): void {
        this.feedbackFlow.handleDismiss();
    }

    // ── Pending Queue ───────────────────────────────────────

    private _handleQueuePending(qp: { comments: string[]; images?: string[] }): void {
        wsLog(`queuePending: comments=${qp.comments.length} images=${(qp.images ?? []).length}`);
        const comments = qp.comments.filter(c => c.trim());
        const images = qp.images ?? [];

        this.pending.set(comments, images);

        this._broadcastToWebviews({
            type: 'pending_synced',
            comments,
            images,
        });
    }

    // ── Pending Delivery (from HTTP consume) ─────────────────

    private _onPendingDelivered(comments: string[], images: string[]): void {
        const combined = comments.join('\n\n') || '';
        this._addMessage({
            role: 'user',
            content: combined,
            timestamp: new Date().toISOString(),
            pending_delivered: true,
            images: images.length > 0 ? images : undefined,
        });

        this._broadcastToWebviews({
            type: 'pending_delivered',
            comments,
            images,
        });
    }

    // ── State Sync ──────────────────────────────────────────

    private _hubSnapshot() {
        const pendingSessions = this.feedback.pendingSessions();
        return buildHubSnapshot({
            port: this.port,
            pid: process.pid,
            version: this.version,
            workspaces: this.workspaces,
            webviews: this.clients.counts().webviews,
            mcpServers: this.clients.counts().mcpServers,
            pendingCount: this.feedback.pendingCount(),
            pendingSessions,
        });
    }

    private _sendState(ws: WebSocket): void {
        const entry = this.pending.read();
        const pendingSessions = this.feedback.pendingSessions();
        const hub = this._hubSnapshot();
        const generation = this.stateSyncGenerations.get(ws) ?? 0;
        this.stateSyncGenerations.set(ws, generation + 1);
        const sessionWire = pendingSessions.map((s) => ({
            id: s.id,
            label: s.label,
            summary: s.summary,
            waiting: s.waiting,
            mcp_detached: s.mcp_detached,
            ...(s.projectDir ? { project_directory: s.projectDir } : {}),
            ...(s.traceId ? { trace_id: s.traceId } : {}),
        }));
        const pendingFp = pendingSessionsFingerprint(sessionWire);
        const hubFp = hubFingerprint(hub as unknown as Record<string, unknown>);
        const lastFp = this.stateSyncFingerprints.get(ws);
        const messageCount = this.timeline.getMessages().length;
        const fpChanged = !lastFp
            || lastFp.pending !== pendingFp
            || lastFp.hub !== hubFp
            || lastFp.messageCount !== messageCount;
        if (fpChanged || generation === 0) {
            const delta: string[] = [];
            if (!lastFp) delta.push('init');
            else {
                if (lastFp.pending !== pendingFp) delta.push('pending');
                if (lastFp.hub !== hubFp) delta.push('hub');
                if (lastFp.messageCount !== messageCount) delta.push('messages');
            }
            wsLog(
                `stateSync: gen=${generation} changed=${delta.join('+') || 'none'} `
                + `pending=${pendingSessions.length} mcp=${hub.mcp_servers} detached=${hub.mcp_detached_count}`,
            );
            hubStructuredLog('state_sync', {
                port: this.port,
                pending: pendingSessions.length,
                gen: generation,
                changed: delta.join('+') || 'none',
            });
        }
        this._send(ws, buildStateSyncPayload({
            messages: this.timeline.getMessages(),
            syncGeneration: generation,
            pendingComments: entry?.comments ?? [],
            pendingImages: entry?.images ?? [],
            feedbackQueueSize: this.feedback.pendingCount(),
            pendingSessions: sessionWire,
            hub: hub as unknown as Record<string, unknown>,
            lastPendingFingerprint: lastFp?.pending,
            lastHubFingerprint: lastFp?.hub,
            lastMessageCount: lastFp?.messageCount,
        }));
        this.stateSyncFingerprints.set(ws, { pending: pendingFp, hub: hubFp, messageCount });
    }

    // ── Heartbeat ───────────────────────────────────────────

    public onSleepResumeWithPending?: (minutesSleep: number) => void;
    private lastHeartbeatAt = Date.now();
    private sleepResumeNotifiedAt = 0;

    private _startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            const gap = now - this.lastHeartbeatAt;
            this.lastHeartbeatAt = now;

            if (gap > 120_000 && this.feedback.pendingCount() > 0) {
                const minutesSleep = Math.round(gap / 60_000);
                if (now - this.sleepResumeNotifiedAt > 300_000) {
                    this.sleepResumeNotifiedAt = now;
                    wsLog(`sleep_resume_detected: gap=${minutesSleep}min pending=${this.feedback.pendingCount()}`);
                    this.onSleepResumeWithPending?.(minutesSleep);
                }
            }

            this.clients.sweepStale(now, CLIENT_TIMEOUT, () => { });
            this._ensureServerRegistration();
        }, HEARTBEAT_INTERVAL);
    }

    private _ensureServerRegistration(): void {
        if (this.workspaces.length === 0 || this.port === 0) return;
        for (const ws of this.workspaces) {
            const hash = projectHash(ws);
            const existing = readServerByHash(hash);
            if (!existing || existing.port !== this.port || existing.pid !== process.pid) {
                wsLog(`re-registering server for workspace: ${ws}`);
                this._registerServer();
                return;
            }
        }
    }

    // ── Transport ───────────────────────────────────────────

    private _send(ws: WebSocket, data: Record<string, unknown>): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    private _broadcastSessionUpdated(
        summary: string,
        sessionId?: string,
        projectDirectory?: string,
        traceId?: string,
    ): void {
        const payload: Record<string, unknown> = {
            type: 'session_updated',
            summary,
            ...(sessionId ? { session_id: sessionId } : {}),
            ...(projectDirectory ? { project_directory: projectDirectory } : {}),
            ...(traceId ? { trace_id: traceId } : {}),
        };
        const count = this._broadcastToWebviews(payload);
        const delivery = evaluateBroadcastDelivery(count);
        wsLog(sessionUpdatedLogLine(sessionId ?? '(none)', delivery, projectDirectory, traceId));
    }

    private _replayPendingSessions(ws: WebSocket): void {
        for (const session of this.feedback.pendingSessions()) {
            wsLog(sessionReplayLogLine(session.id, 'webview', session.projectDir, session.traceId));
            this._send(ws, {
                type: 'session_updated',
                summary: session.summary,
                session_id: session.id,
                session_label: session.label,
                ...(session.projectDir ? { project_directory: session.projectDir } : {}),
                ...(session.traceId ? { trace_id: session.traceId } : {}),
            });
        }
    }

    private _broadcastToWebviews(data: Record<string, unknown>): number {
        let count = 0;
        this.clients.forEachWebview((ws) => {
            this._send(ws, data);
            count++;
        });
        return count;
    }
}
