/** Broadcast when Cursor Agent turn ended but panel may still show waiting. */
export type AgentTurnStatusReason = 'link_lost' | 'cursor_ended' | 'cursor_maybe_idle';
export declare function agentTurnStatusPayload(opts: {
    sessionId: string;
    reason: AgentTurnStatusReason;
    detail: string;
    traceId?: string;
}): Record<string, unknown>;
export declare function agentTurnStatusLogLine(opts: {
    sessionId: string;
    reason: AgentTurnStatusReason;
    detail: string;
    traceId?: string;
}): string;
