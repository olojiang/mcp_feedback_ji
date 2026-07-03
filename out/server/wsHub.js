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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const ws_1 = require("ws");
const fileStore_1 = require("../fileStore");
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
const feedbackDelivery_1 = require("../feedbackDelivery");
const clipboardImage_1 = require("../utils/clipboardImage");
const vscode = __importStar(require("vscode"));
const LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs');
function wsLog(msg) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        const logFile = path.join(LOG_DIR, 'extension.log');
        try {
            const stat = fs.statSync(logFile);
            if (stat.size > 2 * 1024 * 1024) {
                try {
                    fs.unlinkSync(logFile + '.old');
                }
                catch { /* ignore */ }
                fs.renameSync(logFile, logFile + '.old');
            }
        }
        catch { /* ignore */ }
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch { /* ignore */ }
}
const PORT_RANGE_START = 48200;
const PORT_RANGE_END = 48300;
const HEARTBEAT_INTERVAL = 30000;
const CLIENT_TIMEOUT = 90000;
const MESSAGE_CAP = 500;
class WsHub {
    constructor(version = '0.0.0') {
        this.server = null;
        this.wss = null;
        this.port = 0;
        this.clients = new clientRegistry_1.ClientRegistry();
        this.heartbeatTimer = null;
        this.workspaces = [];
        this.version = version;
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
    getDebugInfo() {
        return {
            hubPort: this.port,
            hubVersion: this.version,
            workspaces: this.workspaces,
            clients: this.clients.counts(),
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
        // Mark immediately so session_updated broadcasts are not dropped before register arrives.
        client.clientType = 'webview';
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
        for (const ws of this.workspaces) {
            (0, fileStore_1.writeServer)((0, fileStore_1.projectHash)(ws), {
                port: this.port,
                pid: process.pid,
                projectPath: ws,
                version: this.version,
                started_at: Date.now(),
            });
        }
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
                    wsLog(`mcp disconnected: detached sessions=${detached.join(',')}`);
                }
                this.clients.remove(ws);
            },
        });
        return client;
    }
    _routeMessage(ws, client, msg) {
        (0, routeAdapter_1.dispatchRouteMessage)(ws, client, msg, {
            onRegister: (clientType) => {
                client.clientType = clientType;
                wsLog(`client registered: type=${client.clientType}`);
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
                const project = this.feedback.pendingSessions().find((s) => s.id === sessionId)?.projectDir;
                wsLog((0, feedbackDelivery_1.sessionDisplayedLogLine)(sessionId, project));
            },
            onClipboardWrite: (targetWs, msg) => {
                const text = msg.text || '';
                void Promise.resolve(vscode.env.clipboard.writeText(text))
                    .then(() => {
                    wsLog(`clipboard-write ok len=${text.length}`);
                    this._send(targetWs, { type: 'clipboard_write_ok', length: text.length });
                })
                    .catch((err) => {
                    wsLog(`clipboard-write err ${err}`);
                    this._send(targetWs, { type: 'clipboard_write_err', error: String(err) });
                });
            },
            onClipboardPaste: async (targetWs, msg) => {
                const image = await (0, clipboardImage_1.readClipboardImageBase64)();
                let text = '';
                if (!image) {
                    try {
                        text = await vscode.env.clipboard.readText();
                    }
                    catch { /* ignore */ }
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
        wsLog(`stateSync: version=${this.version} port=${this.port} `
            + `workspaces=${JSON.stringify(this.workspaces)} `
            + `pendingSessions=${pendingSessions.length} queue=${this.feedback.pendingCount()} `
            + `mcp=${hub.mcp_servers} detached=${hub.mcp_detached_count}`);
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