import type { ConversationMessage } from './types';

export interface StateSyncInput {
    messages: ConversationMessage[];
    syncGeneration: number;
    pendingComments: string[];
    pendingImages: string[];
    feedbackQueueSize: number;
    pendingSessions: Array<Record<string, unknown>>;
    hub: Record<string, unknown>;
    lastPendingFingerprint?: string;
    lastHubFingerprint?: string;
}

export function pendingSessionsFingerprint(
    sessions: Array<Record<string, unknown>>,
): string {
    return sessions.map((s) => [
        s.id,
        s.waiting,
        s.summary,
        s.mcp_detached,
        s.project_directory,
        s.trace_id,
    ].join(':')).join('|');
}

export function hubFingerprint(hub: Record<string, unknown>): string {
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
export function buildStateSyncPayload(input: StateSyncInput): Record<string, unknown> {
    const incremental = input.syncGeneration > 0;
    const pendingFp = pendingSessionsFingerprint(input.pendingSessions);
    const hubFp = hubFingerprint(input.hub);
    const pendingUnchanged = incremental
        && input.lastPendingFingerprint !== undefined
        && input.lastPendingFingerprint === pendingFp;
    const hubUnchanged = incremental
        && input.lastHubFingerprint !== undefined
        && input.lastHubFingerprint === hubFp;

    const payload: Record<string, unknown> = {
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
    } else {
        payload.pending_sessions = input.pendingSessions;
    }

    if (hubUnchanged) {
        payload.hub_unchanged = true;
    } else {
        payload.hub = input.hub;
    }

    return payload;
}
