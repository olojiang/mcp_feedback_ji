"use strict";
/** Broadcast when Cursor Agent turn ended but panel may still show waiting. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentTurnStatusPayload = agentTurnStatusPayload;
exports.agentTurnStatusLogLine = agentTurnStatusLogLine;
function agentTurnStatusPayload(opts) {
    return {
        type: 'agent_turn_status',
        session_id: opts.sessionId,
        reason: opts.reason,
        detail: opts.detail,
        ...(opts.traceId ? { trace_id: opts.traceId } : {}),
    };
}
function agentTurnStatusLogLine(opts) {
    const parts = [
        'event=agent_turn_status',
        `session=${opts.sessionId}`,
        `trace=${opts.traceId || '-'}`,
        `reason=${opts.reason}`,
        `detail=${opts.detail}`,
    ];
    return parts.join(' ');
}
//# sourceMappingURL=agentTurnStatus.js.map