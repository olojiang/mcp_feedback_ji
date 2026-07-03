"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatLogEvent = formatLogEvent;
/** Key=value log lines for grep-friendly observability. */
function formatLogEvent(component, event, fields) {
    const parts = [`event=${event}`];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === '')
            continue;
        parts.push(`${key}=${value}`);
    }
    return `[${component}] ${parts.join(' ')}`;
}
//# sourceMappingURL=structuredLog.js.map