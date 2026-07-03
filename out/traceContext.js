"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTraceId = resolveTraceId;
exports.traceLogSuffix = traceLogSuffix;
/** Resolve trace id for a feedback round-trip (pure, testable). */
function resolveTraceId(requestTraceId, agentContextTraceId, envTraceId) {
    const pick = requestTraceId || agentContextTraceId || envTraceId;
    return pick && String(pick).trim() ? String(pick).trim() : undefined;
}
function traceLogSuffix(traceId) {
    return traceId ? ` trace=${traceId}` : '';
}
//# sourceMappingURL=traceContext.js.map