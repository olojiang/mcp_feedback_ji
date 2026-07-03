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
export declare function buildStateSyncPayload(input: StateSyncInput): Record<string, unknown>;
