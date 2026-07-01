"use strict";
/**
 * In-memory pending message queue (single queue per extension window).
 *
 * Pending state lives entirely in the extension process.
 * Hooks consume pending via HTTP endpoints on the WS server.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingManager = void 0;
class PendingManager {
    constructor() {
        this.entry = null;
    }
    onPendingDelivered(cb) {
        this.onDelivered = cb;
    }
    set(comments, images) {
        const queue = comments.filter(c => c.trim());
        if (queue.length === 0 && images.length === 0) {
            this.entry = null;
            return;
        }
        this.entry = {
            comments: queue,
            images: images.length > 0 ? images : [],
        };
    }
    read() {
        return this.entry;
    }
    consume() {
        const entry = this.entry;
        if (!entry)
            return null;
        this.entry = null;
        if (this.onDelivered) {
            this.onDelivered({
                comments: entry.comments,
                images: entry.images,
            });
        }
        return entry;
    }
    clear() {
        this.entry = null;
    }
}
exports.PendingManager = PendingManager;
//# sourceMappingURL=pendingManager.js.map