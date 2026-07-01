"use strict";
/**
 * FIFO queue of pending feedback requests.
 *
 * On MCP disconnect, sessions stay alive so the panel can respond.
 * On reconnect for the same project, transport is swapped via updateTransport().
 * resolve returns the *current* transport (not the one captured at enqueue time).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackManager = void 0;
function newSessionId() {
    return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
class FeedbackManager {
    constructor() {
        this.queue = [];
    }
    enqueue(mcpClient, projectDir, summary = '') {
        const sessionId = newSessionId();
        const promise = new Promise((resolve, reject) => {
            this.queue.push({ sessionId, mcpClient, projectDir, summary, resolve, reject });
        });
        return { sessionId, promise };
    }
    resolveFirst(result) {
        const entry = this.queue.shift();
        if (!entry)
            return false;
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }
    resolveBySessionId(sessionId, result) {
        const idx = this.queue.findIndex((entry) => entry.sessionId === sessionId);
        if (idx < 0)
            return false;
        const entry = this.queue.splice(idx, 1)[0];
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }
    updateTransport(newWs, projectDir, summary) {
        if (!projectDir)
            return { updated: false };
        for (const entry of this.queue) {
            if (entry.projectDir && entry.projectDir === projectDir) {
                entry.mcpClient = newWs;
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
    rejectAll(error) {
        for (const entry of this.queue) {
            entry.reject(error);
        }
        this.queue = [];
    }
}
exports.FeedbackManager = FeedbackManager;
//# sourceMappingURL=feedbackManager.js.map