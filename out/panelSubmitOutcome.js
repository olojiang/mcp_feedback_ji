"use strict";
/** Structured logs when panel submit does not reach a live MCP tool call. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.panelSubmitNoEffectLogLine = panelSubmitNoEffectLogLine;
exports.panelSubmitDeliveredLogLine = panelSubmitDeliveredLogLine;
function panelSubmitNoEffectLogLine(opts) {
    const parts = [
        'event=panel_submit_no_effect',
        `reason=${opts.reason}`,
        `session=${opts.sessionId || '-'}`,
        `trace=${opts.traceId || '-'}`,
    ];
    if (opts.project)
        parts.push(`project=${opts.project}`);
    if (opts.feedbackLen !== undefined)
        parts.push(`feedback_len=${opts.feedbackLen}`);
    if (opts.waitMs !== undefined)
        parts.push(`wait_ms=${opts.waitMs}`);
    if (opts.mcpWsReadyState !== undefined)
        parts.push(`mcp_ws_ready_state=${opts.mcpWsReadyState}`);
    if (opts.pendingCount !== undefined)
        parts.push(`pending_count=${opts.pendingCount}`);
    if (opts.detail)
        parts.push(`detail=${opts.detail}`);
    return parts.join(' ');
}
function panelSubmitDeliveredLogLine(opts) {
    const parts = [
        'event=panel_submit_delivered',
        `session=${opts.sessionId}`,
        `trace=${opts.traceId || '-'}`,
        `feedback_len=${opts.feedbackLen}`,
    ];
    if (opts.waitMs !== undefined)
        parts.push(`wait_ms=${opts.waitMs}`);
    if (opts.mcpWsReadyState !== undefined)
        parts.push(`mcp_ws_ready_state=${opts.mcpWsReadyState}`);
    return parts.join(' ');
}
//# sourceMappingURL=panelSubmitOutcome.js.map