/** Auto-release interactive_feedback before Cursor's ~60m tools/call timeout. */
export const CURSOR_KEEPALIVE_MS = readPositiveInt(
    process.env.MCP_FEEDBACK_CURSOR_KEEPALIVE_MS,
    50 * 60 * 1000,
);

export const CURSOR_KEEPALIVE_TOTAL_MIN = Math.max(1, Math.ceil(CURSOR_KEEPALIVE_MS / 60_000));

/** Harmless placeholder text returned with keepalive status (not real user input). */
export const CURSOR_KEEPALIVE_MESSAGE = (
    process.env.MCP_FEEDBACK_CURSOR_KEEPALIVE_MESSAGE || 'hello'
).trim() || 'hello';

/** Send MCP progress notifications while waiting (best-effort for Cursor timeout reset). */
export const CURSOR_PROGRESS_INTERVAL_MS = readPositiveInt(
    process.env.MCP_FEEDBACK_CURSOR_PROGRESS_MS,
    20_000,
);

function readPositiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function elapsedWaitMinutes(startedAt: number, now = Date.now()): number {
    return Math.max(0, Math.floor((now - startedAt) / 60_000));
}

export function cursorKeepaliveLogLine(opts: {
    traceId?: string;
    projectDirectory?: string;
    elapsedMs: number;
    message: string;
}): string {
    return [
        'event=cursor_keepalive_auto_resolve',
        `trace=${opts.traceId || '-'}`,
        `project=${opts.projectDirectory || '-'}`,
        `elapsed_ms=${opts.elapsedMs}`,
        `message=${opts.message}`,
        'reason=prevent_cursor_tool_timeout',
    ].join(' ');
}

export function cursorProgressLogLine(opts: {
    traceId?: string;
    projectDirectory?: string;
    elapsedMin: number;
    totalMin: number;
    progressToken?: string | number;
}): string {
    return [
        'event=cursor_progress_notification',
        `trace=${opts.traceId || '-'}`,
        `project=${opts.projectDirectory || '-'}`,
        `elapsed_min=${opts.elapsedMin}`,
        `total_min=${opts.totalMin}`,
        `progress_token=${opts.progressToken ?? '-'}`,
    ].join(' ');
}

export function createProgressSender(opts: {
    progressToken?: string | number;
    sendNotification?: (notification: {
        method: 'notifications/progress';
        params: {
            progressToken: string | number;
            progress: number;
            total?: number;
            message?: string;
        };
    }) => Promise<void>;
    log?: (msg: string) => void;
    traceId?: string;
    projectDirectory?: string;
    intervalMs?: number;
    startedAt?: number;
    totalMin?: number;
}): { start: () => void; stop: () => void } {
    const intervalMs = opts.intervalMs ?? CURSOR_PROGRESS_INTERVAL_MS;
    const startedAt = opts.startedAt ?? Date.now();
    const totalMin = opts.totalMin ?? CURSOR_KEEPALIVE_TOTAL_MIN;
    let timer: ReturnType<typeof setInterval> | undefined;

    const send = () => {
        if (!opts.progressToken || !opts.sendNotification) return;
        const elapsedMin = elapsedWaitMinutes(startedAt);
        void opts.sendNotification({
            method: 'notifications/progress',
            params: {
                progressToken: opts.progressToken,
                progress: elapsedMin,
                total: totalMin,
                message: 'waiting for user feedback',
            },
        }).catch(() => {
            // Cursor may ignore progress; keepalive timer is the primary guard.
        });
        opts.log?.(cursorProgressLogLine({
            traceId: opts.traceId,
            projectDirectory: opts.projectDirectory,
            elapsedMin,
            totalMin,
            progressToken: opts.progressToken,
        }));
    };

    return {
        start() {
            if (!opts.progressToken || !opts.sendNotification) return;
            send();
            timer = setInterval(send, intervalMs);
        },
        stop() {
            if (timer) clearInterval(timer);
            timer = undefined;
        },
    };
}
