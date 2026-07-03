"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingSessionsFingerprint = pendingSessionsFingerprint;
exports.hubFingerprint = hubFingerprint;
exports.buildStateSyncPayload = buildStateSyncPayload;
exports.buildMessageSync = buildMessageSync;
function pendingSessionsFingerprint(sessions) {
    return sessions.map((s) => [
        s.id,
        s.waiting,
        s.summary,
        s.mcp_detached,
        s.project_directory,
        s.trace_id,
    ].join(':')).join('|');
}
function hubFingerprint(hub) {
    return JSON.stringify({
        port: hub.port,
        pid: hub.pid,
        version: hub.version,
        webviews: hub.webviews,
        mcp_servers: hub.mcp_servers,
        pending_count: hub.pending_count,
        mcp_detached_count: hub.mcp_detached_count,
        workspaces: hub.workspaces,
    });
}
/** Omit heavy timeline after first sync per connection — panel ignores messages today. */
function buildStateSyncPayload(input) {
    const incremental = input.syncGeneration > 0;
    const pendingFp = pendingSessionsFingerprint(input.pendingSessions);
    const hubFp = hubFingerprint(input.hub);
    const pendingUnchanged = incremental
        && input.lastPendingFingerprint !== undefined
        && input.lastPendingFingerprint === pendingFp;
    const hubUnchanged = incremental
        && input.lastHubFingerprint !== undefined
        && input.lastHubFingerprint === hubFp;
    const payload = {
        type: 'state_sync',
        incremental,
        sync_generation: input.syncGeneration,
        pending_comments: input.pendingComments,
        pending_images: input.pendingImages,
        feedback_queue_size: input.feedbackQueueSize,
        ...buildMessageSync({
            syncGeneration: input.syncGeneration,
            messages: input.messages,
            lastMessageCount: input.lastMessageCount,
        }),
    };
    if (pendingUnchanged) {
        payload.pending_sessions_unchanged = true;
    }
    else {
        payload.pending_sessions = input.pendingSessions;
    }
    if (hubUnchanged) {
        payload.hub_unchanged = true;
    }
    else {
        payload.hub = input.hub;
    }
    return payload;
}
function buildMessageSync(input) {
    const incremental = input.syncGeneration > 0;
    const prevCount = input.lastMessageCount ?? 0;
    const count = input.messages.length;
    if (!incremental) {
        return { messages: input.messages };
    }
    if (count === prevCount) {
        return { messages_unchanged: true };
    }
    if (count > prevCount) {
        return {
            message_patches: [{
                    op: 'append',
                    messages: input.messages.slice(prevCount),
                }],
        };
    }
    return { messages: input.messages };
}
//# sourceMappingURL=stateSyncPayload.js.map