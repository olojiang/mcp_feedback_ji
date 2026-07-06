/** User-facing error when extension WebSocket drops mid-feedback. */
export function formatExtensionCloseError(
    phase = 'feedback',
    reason: 'extension_ws_close' | 'stdio_idle' | 'hub_sweep' | 'cursor_hard_timeout_suspected' = 'extension_ws_close',
): string {
    const hint = 'Reload Window in each Cursor window, then toggle MCP off/on in Settings';
    return `Extension connection closed during ${phase} wait (reason=${reason}) — ${hint}`;
}
