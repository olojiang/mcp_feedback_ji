/** Auto-release interactive_feedback before Cursor's ~60m tools/call timeout. 0 = disabled (progress-only mode). */
export const CURSOR_KEEPALIVE_MS = readKeepaliveMs(
    process.env.MCP_FEEDBACK_CURSOR_KEEPALIVE_MS,
    0,
);

export const CURSOR_KEEPALIVE_TOTAL_MIN = CURSOR_KEEPALIVE_MS > 0
    ? Math.max(1, Math.ceil(CURSOR_KEEPALIVE_MS / 60_000))
    : 0;

/** Send MCP progress notifications while waiting (best-effort for Cursor timeout reset). */
export const DEFAULT_CURSOR_PROGRESS_INTERVAL_MS = 25_000;

export const CURSOR_PROGRESS_INTERVAL_MS = readPositiveInt(
    process.env.MCP_FEEDBACK_CURSOR_PROGRESS_MS,
    DEFAULT_CURSOR_PROGRESS_INTERVAL_MS,
);

/** Progress bar total minutes when keepalive disabled (expected Cursor hard timeout window). */
export const CURSOR_PROGRESS_TOTAL_MIN = readPositiveInt(
    process.env.MCP_FEEDBACK_CURSOR_PROGRESS_TOTAL_MIN,
    CURSOR_KEEPALIVE_MS > 0 ? Math.max(1, Math.ceil(CURSOR_KEEPALIVE_MS / 60_000)) : 60,
);

/** Harmless placeholder text returned with keepalive status (not real user input). */
export const CURSOR_KEEPALIVE_MESSAGE = (
    process.env.MCP_FEEDBACK_CURSOR_KEEPALIVE_MESSAGE || 'hello'
).trim() || 'hello';

function readPositiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function readKeepaliveMs(raw: string | undefined, fallback: number): number {
    if (raw === '0') return 0;
    return readPositiveInt(raw, fallback);
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

export function progressSendResultLogLine(opts: {
    ok: boolean;
    tick: number;
    elapsedMin: number;
    totalMin: number;
    progressToken?: string | number;
    sessionId?: string;
    traceId?: string;
    projectDirectory?: string;
    durationMs: number;
    wsReadyState?: number;
    error?: string;
}): string {
    const parts = [
        `event=progress_send_${opts.ok ? 'ok' : 'fail'}`,
        `tick=${opts.tick}`,
        `elapsed_min=${opts.elapsedMin}`,
        `total_min=${opts.totalMin}`,
        `duration_ms=${opts.durationMs}`,
        `progress_token=${opts.progressToken ?? '-'}`,
        `trace=${opts.traceId || '-'}`,
        `project=${opts.projectDirectory || '-'}`,
    ];
    if (opts.sessionId) parts.push(`session=${opts.sessionId}`);
    if (opts.wsReadyState !== undefined) parts.push(`ws_ready_state=${opts.wsReadyState}`);
    if (opts.error) parts.push(`error=${opts.error}`);
    return parts.join(' ');
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
    getSessionId?: () => string | undefined;
    getWsReadyState?: () => number | undefined;
}): { start: () => void; stop: () => void; tickCount: () => number } {
    const intervalMs = opts.intervalMs ?? CURSOR_PROGRESS_INTERVAL_MS;
    const startedAt = opts.startedAt ?? Date.now();
    const totalMin = opts.totalMin ?? (CURSOR_KEEPALIVE_MS > 0 ? CURSOR_KEEPALIVE_TOTAL_MIN : CURSOR_PROGRESS_TOTAL_MIN);
    let timer: ReturnType<typeof setInterval> | undefined;
    let tick = 0;

    const send = () => {
        const sessionId = opts.getSessionId?.();
        const wsReadyState = opts.getWsReadyState?.();
        if (!opts.progressToken || !opts.sendNotification) {
            opts.log?.([
                'event=progress_send_skipped',
                'reason=missing_token_or_sender',
                `progress_token=${opts.progressToken ?? '-'}`,
                `trace=${opts.traceId || '-'}`,
                `project=${opts.projectDirectory || '-'}`,
                sessionId ? `session=${sessionId}` : '',
            ].filter(Boolean).join(' '));
            return;
        }
        tick++;
        const elapsedMin = elapsedWaitMinutes(startedAt);
        const sendStarted = Date.now();
        void opts.sendNotification({
            method: 'notifications/progress',
            params: {
                progressToken: opts.progressToken,
                progress: elapsedMin,
                total: totalMin,
                message: 'waiting for user feedback',
            },
        }).then(() => {
            opts.log?.(progressSendResultLogLine({
                ok: true,
                tick,
                elapsedMin,
                totalMin,
                progressToken: opts.progressToken,
                sessionId,
                traceId: opts.traceId,
                projectDirectory: opts.projectDirectory,
                durationMs: Date.now() - sendStarted,
                wsReadyState,
            }));
        }).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            opts.log?.(progressSendResultLogLine({
                ok: false,
                tick,
                elapsedMin,
                totalMin,
                progressToken: opts.progressToken,
                sessionId,
                traceId: opts.traceId,
                projectDirectory: opts.projectDirectory,
                durationMs: Date.now() - sendStarted,
                wsReadyState,
                error: message,
            }));
        });
        if (elapsedMin >= totalMin) {
            opts.log?.([
                'event=progress_over_total',
                `elapsed_min=${elapsedMin}`,
                `total_min=${totalMin}`,
                `tick=${tick}`,
                `progress_token=${opts.progressToken ?? '-'}`,
                `trace=${opts.traceId || '-'}`,
                sessionId ? `session=${sessionId}` : '',
            ].filter(Boolean).join(' '));
        }
    };

    return {
        start() {
            if (!opts.progressToken || !opts.sendNotification) {
                opts.log?.([
                    'event=progress_sender_disabled',
                    'reason=missing_token_or_sender',
                    `progress_token=${opts.progressToken ?? '-'}`,
                    `trace=${opts.traceId || '-'}`,
                ].join(' '));
                return;
            }
            send();
            timer = setInterval(send, intervalMs);
        },
        stop() {
            if (timer) clearInterval(timer);
            timer = undefined;
        },
        tickCount() {
            return tick;
        },
    };
}
