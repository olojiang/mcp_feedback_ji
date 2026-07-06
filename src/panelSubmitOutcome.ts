/** Structured logs when panel submit does not reach a live MCP tool call. */

export type PanelSubmitNoEffectReason =
    | 'session_not_on_hub_queue'
    | 'no_pending_session'
    | 'stale_session_fallback'
    | 'project_mismatch'
    | 'mcp_detached'
    | 'mcp_ws_not_open'
    | 'mcp_gone_after_resolve'
    | 'transport_queued';

export function panelSubmitNoEffectLogLine(opts: {
    reason: PanelSubmitNoEffectReason;
    sessionId?: string;
    traceId?: string;
    project?: string;
    feedbackLen?: number;
    waitMs?: number;
    mcpWsReadyState?: number;
    pendingCount?: number;
    detail?: string;
}): string {
    const parts = [
        'event=panel_submit_no_effect',
        `reason=${opts.reason}`,
        `session=${opts.sessionId || '-'}`,
        `trace=${opts.traceId || '-'}`,
    ];
    if (opts.project) parts.push(`project=${opts.project}`);
    if (opts.feedbackLen !== undefined) parts.push(`feedback_len=${opts.feedbackLen}`);
    if (opts.waitMs !== undefined) parts.push(`wait_ms=${opts.waitMs}`);
    if (opts.mcpWsReadyState !== undefined) parts.push(`mcp_ws_ready_state=${opts.mcpWsReadyState}`);
    if (opts.pendingCount !== undefined) parts.push(`pending_count=${opts.pendingCount}`);
    if (opts.detail) parts.push(`detail=${opts.detail}`);
    return parts.join(' ');
}

export function panelSubmitDeliveredLogLine(opts: {
    sessionId: string;
    traceId?: string;
    feedbackLen: number;
    waitMs?: number;
    mcpWsReadyState?: number;
}): string {
    const parts = [
        'event=panel_submit_delivered',
        `session=${opts.sessionId}`,
        `trace=${opts.traceId || '-'}`,
        `feedback_len=${opts.feedbackLen}`,
    ];
    if (opts.waitMs !== undefined) parts.push(`wait_ms=${opts.waitMs}`);
    if (opts.mcpWsReadyState !== undefined) parts.push(`mcp_ws_ready_state=${opts.mcpWsReadyState}`);
    return parts.join(' ');
}
