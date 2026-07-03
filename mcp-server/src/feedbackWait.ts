export const FEEDBACK_WAIT_HEARTBEAT_MS = 60_000;

/** Cursor MCP stdio transport is dropped after ~30s without outbound traffic. */
export const STDIO_KEEPALIVE_MS = 10_000;

export function feedbackWaitHeartbeatLine(
    traceId?: string,
    projectDirectory?: string,
): string {
    return `event=feedback_wait_heartbeat trace=${traceId || '-'} project=${projectDirectory || '-'}`;
}
