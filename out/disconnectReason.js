"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_RECONNECT_HINT = void 0;
exports.formatDisconnectEvent = formatDisconnectEvent;
exports.connectionIssueForDisconnect = connectionIssueForDisconnect;
exports.MCP_RECONNECT_HINT = 'Settings → MCP: toggle mcp-feedback-enhanced off/on, or Restart MCP Servers';
function formatDisconnectEvent(reason, fields = {}) {
    const parts = [`reason=${reason}`];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === '')
            continue;
        parts.push(`${key}=${value}`);
    }
    return parts.join(' ');
}
function connectionIssueForDisconnect(reason) {
    switch (reason) {
        case 'extension_ws_close':
            return `Agent disconnected (extension WebSocket closed). ${exports.MCP_RECONNECT_HINT}`;
        case 'hub_sweep':
            return `Agent disconnected (hub stale sweep). Reload Window, then ${exports.MCP_RECONNECT_HINT}`;
        case 'stdio_idle':
            return `Agent disconnected (MCP stdio idle). ${exports.MCP_RECONNECT_HINT}`;
        default:
            return `Agent disconnected. ${exports.MCP_RECONNECT_HINT}`;
    }
}
//# sourceMappingURL=disconnectReason.js.map