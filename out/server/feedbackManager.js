"use strict";
/**
 * FIFO queue of pending feedback requests.
 *
 * On MCP disconnect, sessions stay alive so the panel can respond.
 * On reconnect for the same project (dead MCP ws), transport is swapped via updateTransport().
 * A live MCP connection for the same project always creates a new session tab.
 * resolve returns the *current* transport (not the one captured at enqueue time).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackManager = void 0;
const ws_1 = require("ws");
function newSessionId() {
    return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function isMcpTransportOpen(ws) {
    return ws.readyState === ws_1.WebSocket.OPEN || ws.readyState === ws_1.WebSocket.CONNECTING;
}
class FeedbackManager {
    constructor() {
        this.queue = [];
        this.promises = new Map();
    }
    enqueue(mcpClient, projectDir, summary = '', traceId) {
        const sessionId = newSessionId();
        const promise = new Promise((resolve, reject) => {
            this.queue.push({
                sessionId, mcpClient, projectDir, traceId, summary, resolve, reject,
            });
        });
        this.promises.set(sessionId, promise);
        return { sessionId, promise };
    }
    resolveFirst(result) {
        const entry = this.queue.shift();
        if (!entry)
            return false;
        this.promises.delete(entry.sessionId);
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }
    resolveBySessionId(sessionId, result) {
        const idx = this.queue.findIndex((entry) => entry.sessionId === sessionId);
        if (idx < 0)
            return false;
        const entry = this.queue.splice(idx, 1)[0];
        this.promises.delete(sessionId);
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }
    updateTransport(newWs, projectDir, summary) {
        if (!projectDir)
            return { updated: false };
        for (const entry of this.queue) {
            if (entry.projectDir && entry.projectDir === projectDir && !isMcpTransportOpen(entry.mcpClient)) {
                entry.mcpClient = newWs;
                entry.mcpDetached = false;
                if (summary)
                    entry.summary = summary;
                return { updated: true, sessionId: entry.sessionId };
            }
        }
        return { updated: false };
    }
    hasPending() {
        return this.queue.length > 0;
    }
    pendingCount() {
        return this.queue.length;
    }
    pendingSessions() {
        return this.queue.map((entry) => ({
            id: entry.sessionId,
            label: entry.projectDir ?? entry.sessionId,
            summary: entry.summary,
            projectDir: entry.projectDir,
            ...(entry.traceId ? { traceId: entry.traceId } : {}),
            waiting: true,
            mcp_detached: entry.mcpDetached === true,
        }));
    }
    promiseForSession(sessionId) {
        return this.promises.get(sessionId) ?? null;
    }
    detachMcpClient(ws) {
        const detached = [];
        for (const entry of this.queue) {
            if (entry.mcpClient === ws) {
                entry.mcpDetached = true;
                detached.push(entry.sessionId);
            }
        }
        return detached;
    }
    isMcpDetached(sessionId) {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        return entry?.mcpDetached === true;
    }
    tryAttachHandlers(sessionId) {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        if (!entry || entry.handlersAttached)
            return false;
        entry.handlersAttached = true;
        return true;
    }
    rejectAll(error) {
        for (const entry of this.queue) {
            this.promises.delete(entry.sessionId);
            entry.reject(error);
        }
        this.queue = [];
        this.promises.clear();
    }
}
exports.FeedbackManager = FeedbackManager;
//# sourceMappingURL=feedbackManager.js.map