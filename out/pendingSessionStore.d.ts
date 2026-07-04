export interface PersistedPendingSession {
    id: string;
    summary: string;
    projectDir?: string;
    traceId?: string;
    mcpDetached?: boolean;
    enqueuedAt?: number;
}
export interface PersistedPendingSnapshot {
    workspaces: string[];
    savedAt: number;
    sessions: PersistedPendingSession[];
    pendingComments?: string[];
    pendingImages?: string[];
}
/** Drop persisted pending older than this (default 24h). */
export declare const PENDING_PERSIST_MAX_AGE_MS: number;
export declare function isPersistedSessionExpired(session: PersistedPendingSession, now?: number, maxAgeMs?: number): boolean;
export declare function pendingSessionsFilePath(workspaces: string[]): string;
export declare function writePersistedPendingSessions(workspaces: string[], sessions: PersistedPendingSession[], extras?: {
    pendingComments?: string[];
    pendingImages?: string[];
}): void;
export declare function readPersistedPendingSessions(workspaces: string[]): PersistedPendingSnapshot | null;
export declare function clearPersistedPendingSessions(workspaces: string[]): void;
