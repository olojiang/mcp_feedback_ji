"use strict";
/**
 * WebSocket hub: the central message router.
 *
 * Feedback sessions are keyed by conversation_id (from Cursor),
 * with fallback to project hash or auto-generated key.
 * Sessions survive transport disconnection for reconnection.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsHub = void 0;
const http = __importStar(require("node:http"));
const ws_1 = require("ws");
const fileStore_1 = require("../fileStore");
const registryLock_1 = require("../registryLock");
const transportMetrics_1 = require("../transportMetrics");
const feedbackManager_1 = require("./feedbackManager");
const pendingManager_1 = require("./pendingManager");
const httpRoutes_1 = require("./httpRoutes");
const projectTimeline_1 = require("./projectTimeline");
const clientRegistry_1 = require("./clientRegistry");
const feedbackFlow_1 = require("./feedbackFlow");
const connectionHandlers_1 = require("./connectionHandlers");
const portFinder_1 = require("./portFinder");
const routeAdapter_1 = require("./routeAdapter");
const wsMessageCodec_1 = require("./wsMessageCodec");
const webviewBridge_1 = require("./webviewBridge");
const hubSnapshot_1 = require("../hubSnapshot");
const disconnectReason_1 = require("../disconnectReason");
const feedbackDelivery_1 = require("../feedbackDelivery");
const clipboardImage_1 = require("../utils/clipboardImage");
const clipboardHandlers_js_1 = require("./clipboardHandlers.js");
const extensionFileLog_js_1 = require("../extensionFileLog.js");
const stateSyncPayload_js_1 = require("../stateSyncPayload.js");
const sessionLifecycleLog_js_1 = require("../sessionLifecycleLog.js");
const sessionJournal_js_1 = require("../sessionJournal.js");
function wsLog(msg) {
    (0, extensionFileLog_js_1.hubLog)(msg);
}
const PORT_RANGE_START = 48200;
const PORT_RANGE_END = 48300;
const HEARTBEAT_INTERVAL = 30000;
const CLIENT_TIMEOUT = 90000;
const MESSAGE_CAP = 500;
class WsHub {
    constructor(version = '0.0.0', options = {}) {
        this.server = null;
        this.wss = null;
        this.port = 0;
        this.clients = new clientRegistry_1.ClientRegistry();
        this.heartbeatTimer = null;
        this.workspaces = [];
        this.stateSyncGenerations = new Map();
        this.stateSyncFingerprints = new Map();
        this._mcpConnSeq = 0;
        this._mcpConnIds = new WeakMap();
        this.version = version;
        this.clipboard = options.clipboard ?? {
            writeText: async () => { throw new Error('clipboard port not configured'); },
            readText: async () => '',
        };
        this.feedback = new feedbackManager_1.FeedbackManager();
        this.pending = new pendingManager_1.PendingManager();
        this.timeline = new projectTimeline_1.ProjectTimeline(MESSAGE_CAP);
        this.feedbackFlow = new feedbackFlow_1.FeedbackFlow({
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
                if (ws.readyState !== ws_1.WebSocket.OPEN) {
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
            getHubMeta: () => ({ port: this.port, pid: process.pid }),
            appendSessionJournal: (record) => (0, sessionJournal_js_1.appendSessionJournalRecord)(record),
        });
        this.pending.onPendingDelivered((delivery) => {
            this._onPendingDelivered(delivery.comments, delivery.images);
        });
    }
    // ── Public API ──────────────────────────────────────────
    setWorkspaces(workspaces) {
        this.workspaces = workspaces;
        this.timeline.setWorkspaces(workspaces);
    }
    onFeedbackRequest(cb) {
        this.feedbackFlow.setOnFeedbackRequested(cb);
    }
    onFeedbackResolved(cb) {
        this.feedbackFlow.setOnFeedbackResolved(cb);
    }
    onFeedbackError(cb) {
        this.feedbackFlow.setOnFeedbackError(cb);
    }
    getPort() {
        return this.port;
    }
    getConnectedClients() {
        return this.clients.counts();
    }
    /** Integration tests: run heartbeat stale sweep at a synthetic clock. */
    staleSweepAt(now) {
        if (process.env.MCP_FEEDBACK_TEST_HOOKS !== '1') {
            throw new Error('staleSweepAt is test-only (set MCP_FEEDBACK_TEST_HOOKS=1)');
        }
        this.clients.sweepStale(now, CLIENT_TIMEOUT, () => { });
    }
    /** Integration tests: age a connected client's last pong. */
    setClientLastPong(ws, ts) {
        if (process.env.MCP_FEEDBACK_TEST_HOOKS !== '1') {
            throw new Error('setClientLastPong is test-only (set MCP_FEEDBACK_TEST_HOOKS=1)');
        }
        this.clients.setLastPong(ws, ts);
    }
    getDebugInfo() {
        const transport = (0, transportMetrics_1.buildTransportMetrics)(this.clients.transportCounts());
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
    hasPendingRequests() {
        return this.feedback.hasPending();
    }
    refreshServerRegistration() {
        this._registerServer();
    }
    /** In-process bridge for Cursor webview (avoids unreliable ws:// from webview sandbox). */
    attachWebview(postToPanel) {
        const bridge = (0, webviewBridge_1.createWebviewBridge)(postToPanel);
        const client = this._bindClient(bridge.socket);
        client.clientType = 'webview';
        client.webviewTransport = 'bridge';
        wsLog('client registered: type=webview (bridge)');
        return bridge;
    }
    // ── Lifecycle ───────────────────────────────────────────
    async start() {
        this._cleanup();
        (0, fileStore_1.cleanupStaleServers)();
        this.port = await this._findPort();
        await this._startServer();
        this._registerServer();
        this._startHeartbeat();
        wsLog(`server started: port=${this.port} pid=${process.pid} version=${this.version} ws=${JSON.stringify(this.workspaces)}`);
        return this.port;
    }
    async stop() {
        this._cleanup();
    }
    _cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.timeline.dispose();
        this.pending.clear();
        this.clients.closeAll();
        this.feedback.rejectAll(new Error('Server shutting down'));
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        for (const ws of this.workspaces) {
            (0, fileStore_1.deleteServerByHash)((0, fileStore_1.projectHash)(ws));
        }
        if ((0, registryLock_1.releaseRegistryLockIfOwner)((0, fileStore_1.readRegistryLock)(), process.pid)) {
            (0, fileStore_1.clearRegistryLock)();
        }
    }
    _addMessage(msg) {
        this.timeline.addMessage(msg);
    }
    // ── Server Setup ────────────────────────────────────────
    _findPort() {
        return (0, portFinder_1.findAvailablePort)(PORT_RANGE_START, PORT_RANGE_END);
    }
    _startServer() {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => this._handleHttpRequest(req, res));
            this.wss = new ws_1.WebSocketServer({ server: this.server });
            this.wss.on('connection', (ws) => this._handleConnection(ws));
            this.server.listen(this.port, '127.0.0.1', () => resolve());
        });
    }
    _handleHttpRequest(req, res) {
        const handled = (0, httpRoutes_1.handleHttpRoute)(req, res, {
            port: this.port,
            version: this.version,
            pending: this.pending,
            log: wsLog,
        });
        if (handled)
            return;
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not_found' }));
    }
    _registerServer() {
        const startedAt = Date.now();
        const result = (0, registryLock_1.writeServersBatch)({
            workspaces: this.workspaces,
            info: {
                port: this.port,
                pid: process.pid,
                version: this.version,
                started_at: startedAt,
            },
            projectHash: fileStore_1.projectHash,
            readLock: fileStore_1.readRegistryLock,
            writeLock: fileStore_1.writeRegistryLock,
            writeServer: fileStore_1.writeServer,
            isAlive: (pid) => {
                try {
                    process.kill(pid, 0);
                    return true;
                }
                catch {
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
    _handleConnection(ws) {
        this._bindClient(ws);
    }
    _bindClient(ws) {
        const client = this.clients.add(ws);
        this._send(ws, {
            type: 'connection_established',
            version: this.version,
            port: this.port,
            pid: process.pid,
            workspaces: this.workspaces,
        });
        (0, connectionHandlers_1.bindClientConnectionHandlers)(ws, client, {
            onParsedMessage: (raw) => {
                try {
                    this._routeMessage(ws, client, (0, wsMessageCodec_1.decodeWsMessage)(raw));
                }
                catch (e) {
                    console.error('[MCP Feedback] Parse error:', e);
                }
            },
            onDisconnect: () => {
                const detached = this.feedback.detachMcpClient(ws);
                if (detached.length) {
                    wsLog(`mcp disconnected: ${(0, disconnectReason_1.formatDisconnectEvent)('extension_ws_close', {
                        sessions: detached.join(','),
                    })}`);
                    wsLog((0, sessionLifecycleLog_js_1.formatSessionLifecycleLine)({
                        event: 'mcp_detach',
                        detail: detached.join(','),
                        pendingCount: this.feedback.pendingCount(),
                    }));
                }
                this.clients.remove(ws);
                this.stateSyncGenerations.delete(ws);
                this.stateSyncFingerprints.delete(ws);
            },
        });
        return client;
    }
    _routeMessage(ws, client, msg) {
        const clipboardHandlers = (0, clipboardHandlers_js_1.createClipboardHandlers)({
            clipboard: this.clipboard,
            readImageBase64: clipboardImage_1.readClipboardImageBase64,
            log: wsLog,
            send: (targetWs, data) => this._send(targetWs, data),
        });
        (0, routeAdapter_1.dispatchRouteMessage)(ws, client, msg, {
            onRegister: (clientType) => {
                client.clientType = clientType;
                if (clientType === 'webview' && !client.webviewTransport) {
                    client.webviewTransport = 'tcp';
                }
                wsLog(`client registered: type=${client.clientType} transport=${client.webviewTransport || '-'}`);
                if (clientType === 'mcp-server') {
                    const connId = ++this._mcpConnSeq;
                    this._mcpConnIds.set(ws, connId);
                    wsLog((0, sessionLifecycleLog_js_1.formatSessionLifecycleLine)({
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
                wsLog((0, feedbackDelivery_1.sessionDisplayedLogLine)(sessionId, snap?.projectDir, snap?.traceId));
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
            onProtocolError: (context) => this._send(ws, {
                type: 'protocol_error',
                error: `Invalid message: ${context}`,
            }),
        });
    }
    // ── Feedback Flow ───────────────────────────────────────
    _handleFeedbackRequest(mcpWs, req) {
        this.feedbackFlow.handleFeedbackRequest(mcpWs, req);
    }
    _handleFeedbackResponse(res) {
        this.feedbackFlow.handleFeedbackResponse(res);
    }
    _handleDismiss() {
        this.feedbackFlow.handleDismiss();
    }
    // ── Pending Queue ───────────────────────────────────────
    _handleQueuePending(qp) {
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
    _onPendingDelivered(comments, images) {
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
    _hubSnapshot() {
        const pendingSessions = this.feedback.pendingSessions();
        return (0, hubSnapshot_1.buildHubSnapshot)({
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
    _sendState(ws) {
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
        const pendingFp = (0, stateSyncPayload_js_1.pendingSessionsFingerprint)(sessionWire);
        const hubFp = (0, stateSyncPayload_js_1.hubFingerprint)(hub);
        const lastFp = this.stateSyncFingerprints.get(ws);
        const messageCount = this.timeline.getMessages().length;
        wsLog(`stateSync: version=${this.version} port=${this.port} `
            + `workspaces=${JSON.stringify(this.workspaces)} `
            + `pendingSessions=${pendingSessions.length} queue=${this.feedback.pendingCount()} `
            + `mcp=${hub.mcp_servers} detached=${hub.mcp_detached_count} gen=${generation}`);
        (0, extensionFileLog_js_1.hubStructuredLog)('state_sync', {
            port: this.port,
            pending: pendingSessions.length,
            gen: generation,
            incremental: generation > 0 ? '1' : '0',
        });
        this._send(ws, (0, stateSyncPayload_js_1.buildStateSyncPayload)({
            messages: this.timeline.getMessages(),
            syncGeneration: generation,
            pendingComments: entry?.comments ?? [],
            pendingImages: entry?.images ?? [],
            feedbackQueueSize: this.feedback.pendingCount(),
            pendingSessions: sessionWire,
            hub: hub,
            lastPendingFingerprint: lastFp?.pending,
            lastHubFingerprint: lastFp?.hub,
            lastMessageCount: lastFp?.messageCount,
        }));
        this.stateSyncFingerprints.set(ws, { pending: pendingFp, hub: hubFp, messageCount });
    }
    // ── Heartbeat ───────────────────────────────────────────
    _startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.clients.sweepStale(Date.now(), CLIENT_TIMEOUT, () => { });
            this._ensureServerRegistration();
        }, HEARTBEAT_INTERVAL);
    }
    _ensureServerRegistration() {
        if (this.workspaces.length === 0 || this.port === 0)
            return;
        for (const ws of this.workspaces) {
            const hash = (0, fileStore_1.projectHash)(ws);
            const existing = (0, fileStore_1.readServerByHash)(hash);
            if (!existing || existing.port !== this.port || existing.pid !== process.pid) {
                wsLog(`re-registering server for workspace: ${ws}`);
                this._registerServer();
                return;
            }
        }
    }
    // ── Transport ───────────────────────────────────────────
    _send(ws, data) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }
    _broadcastSessionUpdated(summary, sessionId, projectDirectory, traceId) {
        const payload = {
            type: 'session_updated',
            summary,
            ...(sessionId ? { session_id: sessionId } : {}),
            ...(projectDirectory ? { project_directory: projectDirectory } : {}),
            ...(traceId ? { trace_id: traceId } : {}),
        };
        const count = this._broadcastToWebviews(payload);
        const delivery = (0, feedbackDelivery_1.evaluateBroadcastDelivery)(count);
        wsLog((0, feedbackDelivery_1.sessionUpdatedLogLine)(sessionId ?? '(none)', delivery, projectDirectory, traceId));
    }
    _replayPendingSessions(ws) {
        for (const session of this.feedback.pendingSessions()) {
            wsLog((0, feedbackDelivery_1.sessionReplayLogLine)(session.id, 'webview', session.projectDir, session.traceId));
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
    _broadcastToWebviews(data) {
        let count = 0;
        this.clients.forEachWebview((ws) => {
            this._send(ws, data);
            count++;
        });
        return count;
    }
}
exports.WsHub = WsHub;
//# sourceMappingURL=wsHub.js.map