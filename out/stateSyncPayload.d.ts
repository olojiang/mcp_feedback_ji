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
export declare function pendingSessionsFingerprint(sessions: Array<Record<string, unknown>>): string;
export declare function hubFingerprint(hub: Record<string, unknown>): string;
/** Omit heavy timeline after first sync per connection — panel ignores messages today. */
export declare function buildStateSyncPayload(input: StateSyncInput): Record<string, unknown>;
