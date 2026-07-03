import type { SessionLifecycleEvent } from './sessionLifecycleLog.js';
export interface SessionJournalRecord {
    at: string;
    event: SessionLifecycleEvent;
    /** Panel Chat tab id (fb-...) */
    feedbackSessionId?: string;
    /** Cursor agent/chat id from agent-context.json or MCP trace_id */
    cursorTraceId?: string;
    projectDirectory?: string;
    workspaceRoots?: string[];
    hubPort?: number;
    hubPid?: number;
    mcpConnId?: number;
    mcpReadyState?: number;
    pendingCount?: number;
    /** true when reusing an existing fb- tab instead of creating one */
    continuation: boolean;
    reason?: string;
    summaryPreview?: string;
}
export declare function sessionJournalPath(logDir?: string): string;
export declare function isContinuationEvent(event: SessionLifecycleEvent): boolean;
export declare function buildSessionJournalRecord(input: {
    event: SessionLifecycleEvent;
    feedbackSessionId?: string;
    cursorTraceId?: string;
    projectDirectory?: string;
    workspaceRoots?: string[];
    hubPort?: number;
    hubPid?: number;
    mcpConnId?: number;
    mcpReadyState?: number;
    pendingCount?: number;
    reason?: string;
    summaryPreview?: string;
    at?: Date;
}): SessionJournalRecord;
/** Append one JSON line to session-journal.jsonl (durable audit trail). */
export declare function appendSessionJournalRecord(record: SessionJournalRecord, logDir?: string): void;
