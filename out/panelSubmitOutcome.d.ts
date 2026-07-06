/** Structured logs when panel submit does not reach a live MCP tool call. */
export type PanelSubmitNoEffectReason = 'session_not_on_hub_queue' | 'no_pending_session' | 'stale_session_fallback' | 'project_mismatch' | 'mcp_detached' | 'mcp_ws_not_open' | 'mcp_gone_after_resolve' | 'transport_queued';
export declare function panelSubmitNoEffectLogLine(opts: {
    reason: PanelSubmitNoEffectReason;
    sessionId?: string;
    traceId?: string;
    project?: string;
    feedbackLen?: number;
    waitMs?: number;
    mcpWsReadyState?: number;
    pendingCount?: number;
    detail?: string;
}): string;
export declare function panelSubmitDeliveredLogLine(opts: {
    sessionId: string;
    traceId?: string;
    feedbackLen: number;
    waitMs?: number;
    mcpWsReadyState?: number;
}): string;
