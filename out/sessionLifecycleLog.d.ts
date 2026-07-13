/** Structured session lifecycle lines for extension.log (grep: sessionLifecycle:) */
export type SessionLifecycleEvent = 'create' | 'mcp_connect' | 'transport_reuse' | 'transport_skip' | 'same_transport_duplicate_blocked' | 'trace_reuse' | 'trace_steal' | 'trace_duplicate_blocked' | 'mcp_detach' | 'resolve';
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
export declare function formatSessionLifecycleLine(fields: SessionLifecycleFields): string;
