/** Structured session lifecycle lines for extension.log (grep: sessionLifecycle:) */

export type SessionLifecycleEvent =
    | 'create'
    | 'mcp_connect'
    | 'transport_reuse'
    | 'transport_skip'
    | 'same_transport_duplicate_blocked'
    | 'trace_reuse'
    | 'trace_steal'
    | 'trace_duplicate_blocked'
    | 'mcp_detach'
    | 'resolve';

export interface SessionLifecycleFields {
    event: SessionLifecycleEvent;
    sessionId?: string;
    project?: string;
    traceId?: string;
    cursorTraceId?: string;
    workspaceRoots?: string[];
    hubPort?: number;
    hubPid?: number;
    continuation?: boolean;
    mcpConnId?: number;
    mcpReadyState?: number;
    pendingCount?: number;
    reason?: string;
    detail?: string;
    summaryPreview?: string;
}

export function formatSessionLifecycleLine(fields: SessionLifecycleFields): string {
    const parts = [`sessionLifecycle: event=${fields.event}`];
    if (fields.sessionId) parts.push(`session=${fields.sessionId}`);
    if (fields.project) parts.push(`project=${fields.project}`);
    const trace = fields.cursorTraceId || fields.traceId;
    if (trace) parts.push(`cursorTrace=${trace}`);
    if (fields.workspaceRoots?.length) {
        parts.push(`workspaces=${fields.workspaceRoots.join('|')}`);
    }
    if (fields.hubPort !== undefined) parts.push(`hubPort=${fields.hubPort}`);
    if (fields.hubPid !== undefined) parts.push(`hubPid=${fields.hubPid}`);
    if (fields.continuation !== undefined) parts.push(`continuation=${fields.continuation}`);
    if (fields.mcpReadyState !== undefined) parts.push(`mcpRs=${fields.mcpReadyState}`);
    if (fields.pendingCount !== undefined) parts.push(`pending=${fields.pendingCount}`);
    if (fields.reason) parts.push(`reason=${fields.reason}`);
    if (fields.detail) parts.push(`detail=${fields.detail}`);
    if (fields.summaryPreview) parts.push(`summary=${fields.summaryPreview.slice(0, 80)}`);
    return parts.join(' ');
}
