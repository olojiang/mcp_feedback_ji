/** Resolve trace id for a feedback round-trip (pure, testable). */
export declare function resolveTraceId(requestTraceId?: string, agentContextTraceId?: string, envTraceId?: string): string | undefined;
export declare function traceLogSuffix(traceId?: string): string;
