/** Structured disconnect reason for logs and panel hints. */
export type DisconnectReason = 'extension_ws_close' | 'hub_sweep' | 'stdio_idle';
export declare const MCP_RECONNECT_HINT = "Settings \u2192 MCP: toggle mcp-feedback-enhanced off/on, or Restart MCP Servers";
export declare function formatDisconnectEvent(reason: DisconnectReason, fields?: Record<string, string | number | undefined>): string;
export declare function connectionIssueForDisconnect(reason: DisconnectReason): string;
