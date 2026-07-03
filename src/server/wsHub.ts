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
import * as vscode from 'vscode';
import { getLogsDir } from '../configPaths.js';

const LOG_DIR = getLogsDir();
function wsLog(msg: string): void {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        const logFile = path.join(LOG_DIR, 'extension.log');
        try {
            const stat = fs.statSync(logFile);
            if (stat.size > 2 * 1024 * 1024) {
                try { fs.unlinkSync(logFile + '.old'); } catch { /* ignore */ }
                fs.renameSync(logFile, logFile + '.old');
            }
        } catch { /* ignore */ }
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch { /* ignore */ }
}

const PORT_RANGE_START = 48200;
const PORT_RANGE_END = 48300;
const HEARTBEAT_INTERVAL = 30_000;
const CLIENT_TIMEOUT = 90_000;
const MESSAGE_CAP = 500;

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

    constructor(version = '0.0.0') {
        this.version = version;
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
                this._send(ws, {
                    type: 'feedback_result',
                    feedback: result.feedback,
                    images: result.images,
                });
            },
            sendError: (ws, error) => {
                this._send(ws, {
                    type: 'feedback_error',
                    error: error.message,
                });
            },
            onFeedbackRequested: undefined,
            log: wsLog,
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
        this.feedbackFlow.setOnFeedbackRequested(cb);
    }

    onFeedbackResolved(cb: () => void): void {
        this.feedbackFlow.setOnFeedbackResolved(cb);
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
        return this.port;
    }

    async stop(): Promise<void> {
        this._cleanup();
    }

    private _cleanup(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.timeline.dispose();

        this.pending.clear();

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
                    console.error('[MCP Feedback] Parse error:', e);
                }
            },
            onDisconnect: () => {
                const detached = this.feedback.detachMcpClient(ws);
                if (detached.length) {
                    wsLog(`mcp disconnected: ${formatDisconnectEvent('extension_ws_close', {
                        sessions: detached.join(','),
                    })}`);
                }
                this.clients.remove(ws);
            },
        });
        return client;
    }

    private _routeMessage(ws: WebSocket, client: ConnectedClient, msg: WSMessage): void {
        dispatchRouteMessage(ws, client, msg, {
            onRegister: (clientType) => {
                client.clientType = clientType;
                if (clientType === 'webview' && !client.webviewTransport) {
                    client.webviewTransport = 'tcp';
                }
                wsLog(`client registered: type=${client.clientType} transport=${client.webviewTransport || '-'}`);
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
            onClipboardWrite: (targetWs, msg) => {
                const text = msg.text || '';
                void Promise.resolve(vscode.env.clipboard.writeText(text))
                    .then(() => {
                        wsLog(`clipboard-write ok len=${text.length}`);
                        this._send(targetWs, { type: 'clipboard_write_ok', length: text.length });
                    })
                    .catch((err: unknown) => {
                        wsLog(`clipboard-write err ${err}`);
                        this._send(targetWs, { type: 'clipboard_write_err', error: String(err) });
                    });
            },
            onClipboardPaste: async (targetWs, msg) => {
                const image = await readClipboardImageBase64();
                let text = '';
                if (!image) {
                    try {
                        text = await vscode.env.clipboard.readText();
                    } catch { /* ignore */ }
                }
                wsLog(`clipboard-paste ok image=${!!image} textLen=${text.length}`);
                this._send(targetWs, {
                    type: 'clipboard_paste_result',
                    request_id: msg.request_id,
                    text,
                    image,
                });
            },
            sendPong: (targetWs) => this._send(targetWs, {
                type: 'pong',
                body: 'pong',
                hub: this._hubSnapshot(),
            }),
            onProtocolError: (context) => this._send(ws, {
                type: 'protocol_error',
                error: `Invalid message: ${context}`,
            }),
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
        wsLog(
            `stateSync: version=${this.version} port=${this.port} `
            + `workspaces=${JSON.stringify(this.workspaces)} `
            + `pendingSessions=${pendingSessions.length} queue=${this.feedback.pendingCount()} `
            + `mcp=${hub.mcp_servers} detached=${hub.mcp_detached_count}`,
        );
        this._send(ws, {
            type: 'state_sync',
            messages: this.timeline.getMessages(),
            pending_comments: entry?.comments ?? [],
            pending_images: entry?.images ?? [],
            feedback_queue_size: this.feedback.pendingCount(),
            pending_sessions: pendingSessions.map((s) => ({
                id: s.id,
                label: s.label,
                summary: s.summary,
                waiting: s.waiting,
                mcp_detached: s.mcp_detached,
                ...(s.projectDir ? { project_directory: s.projectDir } : {}),
                ...(s.traceId ? { trace_id: s.traceId } : {}),
            })),
            hub,
        });
    }

    // ── Heartbeat ───────────────────────────────────────────

    private _startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            this.clients.sweepStale(Date.now(), CLIENT_TIMEOUT, () => { });
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
