/** Structured session lifecycle lines for extension.log (grep: sessionLifecycle:) */
export type SessionLifecycleEvent = 'create' | 'mcp_connect' | 'transport_reuse' | 'transport_skip' | 'trace_reuse' | 'trace_steal' | 'trace_duplicate_blocked' | 'mcp_detach' | 'resolve';
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
export declare function formatSessionLifecycleLine(fields: SessionLifecycleFields): string;
