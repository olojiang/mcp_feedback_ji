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
    const trace = fields.cursorTraceId || fields.traceId;
    if (trace)
        parts.push(`cursorTrace=${trace}`);
    if (fields.workspaceRoots?.length) {
        parts.push(`workspaces=${fields.workspaceRoots.join('|')}`);
    }
    if (fields.hubPort !== undefined)
        parts.push(`hubPort=${fields.hubPort}`);
    if (fields.hubPid !== undefined)
        parts.push(`hubPid=${fields.hubPid}`);
    if (fields.continuation !== undefined)
        parts.push(`continuation=${fields.continuation}`);
    if (fields.mcpReadyState !== undefined)
        parts.push(`mcpRs=${fields.mcpReadyState}`);
    if (fields.pendingCount !== undefined)
        parts.push(`pending=${fields.pendingCount}`);
    if (fields.reason)
        parts.push(`reason=${fields.reason}`);
    if (fields.detail)
        parts.push(`detail=${fields.detail}`);
    if (fields.summaryPreview)
        parts.push(`summary=${fields.summaryPreview.slice(0, 80)}`);
    return parts.join(' ');
}
//# sourceMappingURL=sessionLifecycleLog.js.map