import { WebSocket } from 'ws';
import { formatExtensionCloseError } from './extensionErrors.js';
import { mcpLog } from './logger.js';
import {
    CURSOR_KEEPALIVE_MESSAGE,
    CURSOR_KEEPALIVE_MS,
    CURSOR_PROGRESS_INTERVAL_MS,
    CURSOR_PROGRESS_TOTAL_MIN,
    createProgressSender,
    cursorKeepaliveLogLine,
} from './cursorKeepalive.js';
import {
    classifyWsCloseBillingRisk,
    CURSOR_HARD_TIMEOUT_SUSPECT_MS,
    elapsedWaitMs,
    requestBillingRiskLogLine,
} from './requestBillingRisk.js';
import { FEEDBACK_WAIT_HEARTBEAT_MS, feedbackWaitHeartbeatLine, shouldLogHeartbeat, STDIO_KEEPALIVE_MS } from './feedbackWait.js';

export { formatExtensionCloseError } from './extensionErrors.js';
export { FEEDBACK_WAIT_HEARTBEAT_MS, feedbackWaitHeartbeatLine, shouldLogHeartbeat, STDIO_KEEPALIVE_MS } from './feedbackWait.js';
export {
    CURSOR_KEEPALIVE_MESSAGE,
    CURSOR_KEEPALIVE_MS,
    CURSOR_KEEPALIVE_TOTAL_MIN,
    CURSOR_PROGRESS_INTERVAL_MS,
    CURSOR_PROGRESS_TOTAL_MIN,
    cursorKeepaliveLogLine,
    createProgressSender,
    elapsedWaitMinutes,
} from './cursorKeepalive.js';

export interface RequestFeedbackDeps {
    log?: (msg: string) => void;
    heartbeatMs?: number;
    onWaitTick?: () => void | Promise<void>;
    stdioKeepaliveMs?: number;
    cursorKeepaliveMs?: number;
    cursorKeepaliveMessage?: string;
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
}

export function connectToExtension(port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            ws.close();
            mcpLog(`[connectToExtension] timeout port=${port}`);
            reject(new Error('Connection timeout'));
        }, 5000);

        ws.once('open', () => {
            if (settled) { ws.close(); return; }
            settled = true;
            clearTimeout(timeout);
            mcpLog(`[connectToExtension] open port=${port}`);
            ws.send(JSON.stringify({
                type: 'register',
                clientType: 'mcp-server',
            }));
            resolve(ws);
        });

        ws.once('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            mcpLog(`[connectToExtension] error port=${port} err=${err.message}`);
            reject(err);
        });
    });
}

export function requestFeedback(
    ws: WebSocket,
    summary: string,
    projectDirectory?: string,
    traceId?: string,
    deps?: RequestFeedbackDeps,
): Promise<{ status?: string; feedback: string; images?: string[]; session_id?: string }> {
    const log = deps?.log ?? mcpLog;
    const heartbeatMs = deps?.heartbeatMs ?? FEEDBACK_WAIT_HEARTBEAT_MS;
    const stdioKeepaliveMs = deps?.stdioKeepaliveMs ?? STDIO_KEEPALIVE_MS;
    const cursorKeepaliveMs = deps?.cursorKeepaliveMs ?? CURSOR_KEEPALIVE_MS;
    const cursorKeepaliveMessage = deps?.cursorKeepaliveMessage ?? CURSOR_KEEPALIVE_MESSAGE;
    const startedAt = Date.now();
    let boundSessionId = '-';

    return new Promise((resolve, reject) => {
        let settled = false;

        const settle = (
            outcome: { kind: 'resolve'; value: { status?: string; feedback: string; images?: string[]; session_id?: string } }
                | { kind: 'reject'; error: Error },
        ) => {
            if (settled) return;
            settled = true;
            cleanup();
            ws.off('message', handler);
            if (outcome.kind === 'resolve') resolve(outcome.value);
            else reject(outcome.error);
        };

        const timeout = setTimeout(() => {
            log('[requestFeedback] 24h timeout reached — resolving with status=timeout');
            settle({ kind: 'resolve', value: { status: 'timeout', feedback: '' } });
        }, 86_400_000);

        const cursorKeepalive = cursorKeepaliveMs > 0
            ? setTimeout(() => {
                const elapsedMs = elapsedWaitMs(startedAt);
                log(cursorKeepaliveLogLine({
                    traceId,
                    projectDirectory,
                    elapsedMs,
                    message: cursorKeepaliveMessage,
                }));
                log(requestBillingRiskLogLine({
                    reason: 'our_keepalive',
                    elapsedMs,
                    traceId,
                    projectDirectory,
                    keepaliveMs: cursorKeepaliveMs,
                    detail: 'tool_will_complete_end_turn_no_retry',
                }));
                settle({ kind: 'resolve', value: { status: 'keepalive', feedback: cursorKeepaliveMessage } });
                try { ws.close(); } catch { /* ignore */ }
            }, cursorKeepaliveMs)
            : undefined;

        let heartbeatTick = 0;
        const waitHeartbeat = setInterval(() => {
            heartbeatTick++;
            if (shouldLogHeartbeat(heartbeatTick)) {
                log(feedbackWaitHeartbeatLine(traceId, projectDirectory));
            }
        }, heartbeatMs);

        let stdioKeepalive: ReturnType<typeof setInterval> | undefined;
        if (deps?.onWaitTick) {
            const tick = () => {
                void deps.onWaitTick?.();
            };
            tick();
            stdioKeepalive = setInterval(tick, stdioKeepaliveMs);
        }

        const progress = createProgressSender({
            progressToken: deps?.progressToken,
            sendNotification: deps?.sendNotification,
            log,
            traceId,
            projectDirectory,
            startedAt,
            getSessionId: () => boundSessionId === '-' ? undefined : boundSessionId,
            getWsReadyState: () => ws.readyState,
        });
        progress.start();

        const logWaitLifecycle = (event: string, extra: Record<string, string | number | undefined> = {}) => {
            const elapsedMs = elapsedWaitMs(startedAt);
            const parts = [
                `event=wait_lifecycle`,
                `phase=${event}`,
                `elapsed_ms=${elapsedMs}`,
                `elapsed_min=${Math.floor(elapsedMs / 60_000)}`,
                `progress_ticks=${progress.tickCount()}`,
                `progress_token=${deps?.progressToken ?? '-'}`,
                `session=${boundSessionId}`,
                `ws_ready_state=${ws.readyState}`,
                `trace=${traceId || '-'}`,
                `project=${projectDirectory || '-'}`,
            ];
            for (const [k, v] of Object.entries(extra)) {
                if (v !== undefined) parts.push(`${k}=${v}`);
            }
            log(parts.join(' '));
        };

        const cleanup = () => {
            clearTimeout(timeout);
            if (cursorKeepalive) clearTimeout(cursorKeepalive);
            clearInterval(waitHeartbeat);
            if (stdioKeepalive) clearInterval(stdioKeepalive);
            progress.stop();
        };

        const handler = (raw: Buffer | string) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'feedback_result') {
                    // already_pending: Hub re-bound this WS to existing session.
                    // Do NOT resolve — wait for the real 'submitted' result.
                    // Resolving early would complete the tool call, causing Cursor
                    // to start a new agent turn (wasting a request).
                    if (msg.status === 'already_pending') {
                        if (msg.session_id) boundSessionId = msg.session_id;
                        log(
                            '[requestFeedback] already_pending — staying subscribed session='
                            + (msg.session_id || '-'),
                        );
                        return;
                    }
                    if (msg.status === 'released_duplicate') {
                        log(
                            '[requestFeedback] released_duplicate session='
                            + (msg.session_id || '-')
                            + ' trace=' + (msg.trace_id || traceId || '-'),
                        );
                        settle({
                            kind: 'resolve',
                            value: {
                                status: 'released_duplicate',
                                feedback: '',
                                session_id: msg.session_id,
                            },
                        });
                        return;
                    }
                    logWaitLifecycle('resolve', {
                        status: msg.status || 'submitted',
                        feedback_len: (msg.feedback || '').length,
                    });
                    log(
                        '[requestFeedback] resolved status=' + (msg.status || 'submitted')
                        + ' session=' + (msg.session_id || '-')
                        + ' feedbackLen=' + (msg.feedback || '').length,
                    );
                    settle({
                        kind: 'resolve',
                        value: {
                            status: msg.status,
                            feedback: msg.feedback || '',
                            images: msg.images,
                            session_id: msg.session_id,
                        },
                    });
                } else if (msg.type === 'session_bound') {
                    boundSessionId = msg.session_id || '-';
                    log(
                        '[requestFeedback] session_bound session=' + boundSessionId
                        + ' trace=' + (msg.trace_id || traceId || '-'),
                    );
                } else if (msg.type === 'feedback_error') {
                    log(`[requestFeedback] feedback_error error=${msg.error || 'Feedback error'}`);
                    settle({ kind: 'reject', error: new Error(msg.error || 'Feedback error') });
                    try { ws.close(); } catch { /* ignore */ }
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.on('message', handler);
        ws.once('close', () => {
            if (settled) return;
            const elapsedMs = elapsedWaitMs(startedAt);
            const risk = classifyWsCloseBillingRisk(elapsedMs);
            logWaitLifecycle('ws_close', { billing_risk: risk });
            log(requestBillingRiskLogLine({
                reason: risk,
                elapsedMs,
                traceId,
                projectDirectory,
                keepaliveMs: cursorKeepaliveMs || 0,
                detail: risk === 'cursor_hard_timeout_suspected'
                    ? 'ws_closed_near_cursor_hard_limit_check_usage'
                    : 'ws_closed_before_keepalive',
            }));
            log('[requestFeedback] WS closed during feedback wait — rejecting');
            settle({
                kind: 'reject',
                error: new Error(formatExtensionCloseError('feedback wait', risk)),
            });
        });

        ws.send(JSON.stringify({
            type: 'feedback_request',
            summary,
            project_directory: projectDirectory,
            ...(traceId ? { trace_id: traceId } : {}),
        }));
        log(`[requestFeedback] feedback_request_sent trace=${traceId || '-'} summary_len=${summary.length}`);

        log(
            '[requestFeedback] wait_config '
            + `keepalive_ms=${cursorKeepaliveMs || 'disabled'} `
            + `progress_interval_ms=${CURSOR_PROGRESS_INTERVAL_MS} `
            + `progress_total_min=${CURSOR_PROGRESS_TOTAL_MIN} `
            + `progress=${deps?.progressToken ? 'enabled' : 'disabled'} `
            + `hard_timeout_suspect_ms=${CURSOR_HARD_TIMEOUT_SUSPECT_MS} `
            + `trace=${traceId || '-'} project=${projectDirectory || '-'}`,
        );
    });
}
