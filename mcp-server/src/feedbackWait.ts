export const FEEDBACK_WAIT_HEARTBEAT_MS = 60_000;

export function feedbackWaitHeartbeatLine(
    traceId?: string,
    projectDirectory?: string,
): string {
    return `event=feedback_wait_heartbeat trace=${traceId || '-'} project=${projectDirectory || '-'}`;
}
