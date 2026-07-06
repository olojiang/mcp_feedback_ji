/** Logs to correlate MCP wait endings with Cursor Usage billing. */

export type BillingRiskReason =
    | 'our_keepalive'
    | 'extension_ws_close'
    | 'cursor_hard_timeout_suspected'
    | 'released_duplicate'
    | 'superseded'
    | 'progress_only_wait_end';

/** Cursor tool hard timeout often appears around 40–60 min (observed ~40 min). */
export const CURSOR_HARD_TIMEOUT_SUSPECT_MS = readPositiveInt(
    process.env.MCP_FEEDBACK_CURSOR_HARD_TIMEOUT_SUSPECT_MS,
    35 * 60 * 1000,
);

function readPositiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function elapsedWaitMs(startedAt: number, now = Date.now()): number {
    return Math.max(0, now - startedAt);
}

export function classifyWsCloseBillingRisk(elapsedMs: number): BillingRiskReason {
    return elapsedMs >= CURSOR_HARD_TIMEOUT_SUSPECT_MS
        ? 'cursor_hard_timeout_suspected'
        : 'extension_ws_close';
}

export function requestBillingRiskLogLine(opts: {
    reason: BillingRiskReason;
    elapsedMs: number;
    traceId?: string;
    projectDirectory?: string;
    keepaliveMs?: number;
    detail?: string;
}): string {
    const parts = [
        'event=request_billing_risk',
        `reason=${opts.reason}`,
        `elapsed_ms=${opts.elapsedMs}`,
        `elapsed_min=${Math.floor(opts.elapsedMs / 60_000)}`,
        `trace=${opts.traceId || '-'}`,
        `project=${opts.projectDirectory || '-'}`,
    ];
    if (opts.keepaliveMs !== undefined) {
        parts.push(`keepalive_ms=${opts.keepaliveMs}`);
    }
    if (opts.detail) {
        parts.push(`detail=${opts.detail}`);
    }
    return parts.join(' ');
}
