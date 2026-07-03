/** Resolve trace id for a feedback round-trip (pure, testable). */
export function resolveTraceId(
    requestTraceId?: string,
    agentContextTraceId?: string,
    envTraceId?: string,
): string | undefined {
    const pick = requestTraceId || agentContextTraceId || envTraceId;
    return pick && String(pick).trim() ? String(pick).trim() : undefined;
}

export function traceLogSuffix(traceId?: string): string {
    return traceId ? ` trace=${traceId}` : '';
}
