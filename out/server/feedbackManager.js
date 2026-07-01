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
class FeedbackManager {
    constructor() {
        this.queue = [];
    }
    enqueue(mcpClient, projectDir) {
        return new Promise((resolve, reject) => {
            this.queue.push({ mcpClient, projectDir, resolve, reject });
        });
    }
    resolveFirst(result) {
        const entry = this.queue.shift();
        if (!entry)
            return false;
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }
    updateTransport(newWs, projectDir) {
        if (!projectDir)
            return false;
        let updated = false;
        for (const entry of this.queue) {
            if (entry.projectDir && entry.projectDir === projectDir) {
                entry.mcpClient = newWs;
                updated = true;
            }
        }
        return updated;
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