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
export declare function pendingSessionsFingerprint(sessions: Array<Record<string, unknown>>): string;
export declare function hubFingerprint(hub: Record<string, unknown>): string;
/** Omit heavy timeline after first sync per connection — panel ignores messages today. */
export declare function buildStateSyncPayload(input: StateSyncInput): Record<string, unknown>;
export interface MessagePatch {
    op: 'append';
    messages: ConversationMessage[];
}
export interface MessageSyncInput {
    syncGeneration: number;
    messages: ConversationMessage[];
    lastMessageCount?: number;
}
export declare function buildMessageSync(input: MessageSyncInput): Record<string, unknown>;
