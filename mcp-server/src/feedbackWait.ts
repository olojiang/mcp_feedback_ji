export const FEEDBACK_WAIT_HEARTBEAT_MS = 60_000;

/** Cursor MCP stdio transport is dropped after ~30s without outbound traffic. */
export const STDIO_KEEPALIVE_MS = 10_000;

const HEARTBEAT_LOG_TICKS = new Set([1, 2, 5, 10, 30, 60]);

/** Whether a heartbeat at the given tick count (1-based, each tick = 60s) should be logged.
 *  Logs at 1, 2, 5, 10, 30, 60 minutes, then every 60 minutes. */
export function shouldLogHeartbeat(tick: number): boolean {
    if (HEARTBEAT_LOG_TICKS.has(tick)) return true;
    if (tick > 60 && tick % 60 === 0) return true;
    return false;
}

/** Stdio keepalive ticks every 10s; throttle file logs to ticks 1,2,6,12,30,60 then every 60 (~10min). */
const STDIO_KEEPALIVE_LOG_TICKS = new Set([1, 2, 6, 12, 30, 60]);

export function shouldLogStdioKeepalive(tick: number): boolean {
    if (STDIO_KEEPALIVE_LOG_TICKS.has(tick)) return true;
    if (tick > 60 && tick % 60 === 0) return true;
    return false;
}

export function feedbackWaitHeartbeatLine(
    traceId?: string,
    projectDirectory?: string,
): string {
    return `event=feedback_wait_heartbeat trace=${traceId || '-'} project=${projectDirectory || '-'}`;
}
