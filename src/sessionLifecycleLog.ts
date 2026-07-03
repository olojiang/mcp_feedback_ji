/** Structured session lifecycle lines for extension.log (grep: sessionLifecycle:) */

export type SessionLifecycleEvent =
    | 'create'
    | 'mcp_connect'
    | 'transport_reuse'
    | 'transport_skip'
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
    mcpConnId?: number;
    mcpReadyState?: number;
    pendingCount?: number;
    reason?: string;
    detail?: string;
}

export function formatSessionLifecycleLine(fields: SessionLifecycleFields): string {
    const parts = [`sessionLifecycle: event=${fields.event}`];
    if (fields.sessionId) parts.push(`session=${fields.sessionId}`);
    if (fields.project) parts.push(`project=${fields.project}`);
    if (fields.traceId) parts.push(`trace=${fields.traceId}`);
    if (fields.mcpConnId !== undefined) parts.push(`mcpConn=${fields.mcpConnId}`);
    if (fields.mcpReadyState !== undefined) parts.push(`mcpRs=${fields.mcpReadyState}`);
    if (fields.pendingCount !== undefined) parts.push(`pending=${fields.pendingCount}`);
    if (fields.reason) parts.push(`reason=${fields.reason}`);
    if (fields.detail) parts.push(`detail=${fields.detail}`);
    return parts.join(' ');
}
