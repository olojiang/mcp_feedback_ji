/** Structured disconnect reason for logs and panel hints. */
export type DisconnectReason = 'extension_ws_close' | 'hub_sweep' | 'stdio_idle';

export const MCP_RECONNECT_HINT =
    'Settings → MCP: toggle mcp-feedback-enhanced off/on, or Restart MCP Servers';

export function formatDisconnectEvent(
    reason: DisconnectReason,
    fields: Record<string, string | number | undefined> = {},
): string {
    const parts = [`reason=${reason}`];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === '') continue;
        parts.push(`${key}=${value}`);
    }
    return parts.join(' ');
}

export function connectionIssueForDisconnect(reason: DisconnectReason): string {
    switch (reason) {
        case 'extension_ws_close':
            return `Agent disconnected (extension WebSocket closed). ${MCP_RECONNECT_HINT}`;
        case 'hub_sweep':
            return `Agent disconnected (hub stale sweep). Reload Window, then ${MCP_RECONNECT_HINT}`;
        case 'stdio_idle':
            return `Agent disconnected (MCP stdio idle). ${MCP_RECONNECT_HINT}`;
        default:
            return `Agent disconnected. ${MCP_RECONNECT_HINT}`;
    }
}
