import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogsDir } from './configPaths.js';
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

export function sessionJournalPath(logDir = getLogsDir()): string {
    return path.join(logDir, 'session-journal.jsonl');
}

export function isContinuationEvent(event: SessionLifecycleEvent): boolean {
    return event === 'transport_reuse'
        || event === 'trace_reuse'
        || event === 'trace_steal';
}

export function buildSessionJournalRecord(input: {
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
}): SessionJournalRecord {
    return {
        at: (input.at ?? new Date()).toISOString(),
        event: input.event,
        feedbackSessionId: input.feedbackSessionId,
        cursorTraceId: input.cursorTraceId,
        projectDirectory: input.projectDirectory,
        workspaceRoots: input.workspaceRoots,
        hubPort: input.hubPort,
        hubPid: input.hubPid,
        mcpConnId: input.mcpConnId,
        mcpReadyState: input.mcpReadyState,
        pendingCount: input.pendingCount,
        continuation: isContinuationEvent(input.event),
        reason: input.reason,
        summaryPreview: input.summaryPreview?.slice(0, 120),
    };
}

/** Append one JSON line to session-journal.jsonl (durable audit trail). */
export function appendSessionJournalRecord(
    record: SessionJournalRecord,
    logDir = getLogsDir(),
): void {
    const dir = logDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(sessionJournalPath(dir), `${JSON.stringify(record)}\n`, 'utf8');
}
