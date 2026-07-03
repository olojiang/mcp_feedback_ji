/** User-facing error when extension WebSocket drops mid-feedback. */
export function formatExtensionCloseError(phase = 'feedback'): string {
    return `Extension connection closed during ${phase} — Reload Window in each Cursor window, then toggle MCP off/on if needed`;
}
