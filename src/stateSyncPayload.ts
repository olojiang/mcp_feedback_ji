import type { ConversationMessage } from './types';

export interface StateSyncInput {
    messages: ConversationMessage[];
    syncGeneration: number;
    pendingComments: string[];
    pendingImages: string[];
    feedbackQueueSize: number;
    pendingSessions: Array<Record<string, unknown>>;
    hub: Record<string, unknown>;
}

/** Omit heavy timeline after first sync per connection — panel ignores messages today. */
export function buildStateSyncPayload(input: StateSyncInput): Record<string, unknown> {
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
