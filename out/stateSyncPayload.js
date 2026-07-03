"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStateSyncPayload = buildStateSyncPayload;
/** Omit heavy timeline after first sync per connection — panel ignores messages today. */
function buildStateSyncPayload(input) {
    const incremental = input.syncGeneration > 0;
    return {
        type: 'state_sync',
        incremental,
        sync_generation: input.syncGeneration,
        messages: incremental ? [] : input.messages,
        pending_comments: input.pendingComments,
        pending_images: input.pendingImages,
        feedback_queue_size: input.feedbackQueueSize,
        pending_sessions: input.pendingSessions,
        hub: input.hub,
    };
}
//# sourceMappingURL=stateSyncPayload.js.map