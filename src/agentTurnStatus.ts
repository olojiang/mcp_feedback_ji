/** Broadcast when Cursor Agent turn ended but panel may still show waiting. */

export type AgentTurnStatusReason = 'link_lost' | 'cursor_ended' | 'cursor_maybe_idle';

export function agentTurnStatusPayload(opts: {
    sessionId: string;
    reason: AgentTurnStatusReason;
    detail: string;
    traceId?: string;
}): Record<string, unknown> {
    return {
        type: 'agent_turn_status',
        session_id: opts.sessionId,
        reason: opts.reason,
        detail: opts.detail,
        ...(opts.traceId ? { trace_id: opts.traceId } : {}),
    };
}

export function agentTurnStatusLogLine(opts: {
    sessionId: string;
    reason: AgentTurnStatusReason;
    detail: string;
    traceId?: string;
}): string {
    const parts = [
        'event=agent_turn_status',
        `session=${opts.sessionId}`,
        `trace=${opts.traceId || '-'}`,
        `reason=${opts.reason}`,
        `detail=${opts.detail}`,
    ];
    return parts.join(' ');
}
