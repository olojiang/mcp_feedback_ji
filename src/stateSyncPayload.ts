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
    lastMessageCount?: number;
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
        && input.lastPendingFingerprint === pendingFp
        && (input.lastHubFingerprint === undefined || input.lastHubFingerprint === hubFp);
    const hubUnchanged = incremental
        && input.lastHubFingerprint !== undefined
        && input.lastHubFingerprint === hubFp;

    const payload: Record<string, unknown> = {
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

export interface MessagePatch {
    op: 'append';
    messages: ConversationMessage[];
}

export interface MessageSyncInput {
    syncGeneration: number;
    messages: ConversationMessage[];
    lastMessageCount?: number;
}

export function buildMessageSync(input: MessageSyncInput): Record<string, unknown> {
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
