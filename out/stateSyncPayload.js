"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingSessionsFingerprint = pendingSessionsFingerprint;
exports.hubFingerprint = hubFingerprint;
exports.buildStateSyncPayload = buildStateSyncPayload;
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
        messages: incremental ? [] : input.messages,
        pending_comments: input.pendingComments,
        pending_images: input.pendingImages,
        feedback_queue_size: input.feedbackQueueSize,
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
//# sourceMappingURL=stateSyncPayload.js.map