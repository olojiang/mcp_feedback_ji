"use strict";
/** Structured session lifecycle lines for extension.log (grep: sessionLifecycle:) */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSessionLifecycleLine = formatSessionLifecycleLine;
function formatSessionLifecycleLine(fields) {
    const parts = [`sessionLifecycle: event=${fields.event}`];
    if (fields.sessionId)
        parts.push(`session=${fields.sessionId}`);
    if (fields.project)
        parts.push(`project=${fields.project}`);
    if (fields.traceId)
        parts.push(`trace=${fields.traceId}`);
    if (fields.mcpConnId !== undefined)
        parts.push(`mcpConn=${fields.mcpConnId}`);
    if (fields.mcpReadyState !== undefined)
        parts.push(`mcpRs=${fields.mcpReadyState}`);
    if (fields.pendingCount !== undefined)
        parts.push(`pending=${fields.pendingCount}`);
    if (fields.reason)
        parts.push(`reason=${fields.reason}`);
    if (fields.detail)
        parts.push(`detail=${fields.detail}`);
    return parts.join(' ');
}
//# sourceMappingURL=sessionLifecycleLog.js.map