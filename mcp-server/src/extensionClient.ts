import { WebSocket } from 'ws';
import { formatExtensionCloseError } from './extensionErrors.js';
import { mcpLog } from './logger.js';
import {
    CURSOR_KEEPALIVE_MESSAGE,
    CURSOR_KEEPALIVE_MS,
    createProgressSender,
    cursorKeepaliveLogLine,
} from './cursorKeepalive.js';
import { FEEDBACK_WAIT_HEARTBEAT_MS, feedbackWaitHeartbeatLine, shouldLogHeartbeat, STDIO_KEEPALIVE_MS } from './feedbackWait.js';

export { formatExtensionCloseError } from './extensionErrors.js';
export { FEEDBACK_WAIT_HEARTBEAT_MS, feedbackWaitHeartbeatLine, shouldLogHeartbeat, STDIO_KEEPALIVE_MS } from './feedbackWait.js';
export {
    CURSOR_KEEPALIVE_MESSAGE,
    CURSOR_KEEPALIVE_MS,
    CURSOR_KEEPALIVE_TOTAL_MIN,
    CURSOR_PROGRESS_INTERVAL_MS,
    cursorKeepaliveLogLine,
    cursorProgressLogLine,
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

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            log('[requestFeedback] 24h timeout reached — resolving with status=timeout');
            resolve({ status: 'timeout', feedback: '' });
        }, 86_400_000);

        const cursorKeepalive = setTimeout(() => {
            cleanup();
            ws.off('message', handler);
            log(cursorKeepaliveLogLine({
                traceId,
                projectDirectory,
                elapsedMs: Date.now() - startedAt,
                message: cursorKeepaliveMessage,
            }));
            try { ws.close(); } catch { /* ignore */ }
            resolve({ status: 'keepalive', feedback: cursorKeepaliveMessage });
        }, cursorKeepaliveMs);

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
        });
        progress.start();

        const cleanup = () => {
            clearTimeout(timeout);
            clearTimeout(cursorKeepalive);
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
                        log(
                            '[requestFeedback] already_pending — staying subscribed session='
                            + (msg.session_id || '-'),
                        );
                        return;
                    }
                    cleanup();
                    ws.off('message', handler);
                    log(
                        '[requestFeedback] resolved status=' + (msg.status || 'submitted')
                        + ' session=' + (msg.session_id || '-')
                        + ' feedbackLen=' + (msg.feedback || '').length,
                    );
                    resolve({
                        status: msg.status,
                        feedback: msg.feedback || '',
                        images: msg.images,
                        session_id: msg.session_id,
                    });
                } else if (msg.type === 'session_bound') {
                    log(
                        '[requestFeedback] session_bound session=' + (msg.session_id || '-')
                        + ' trace=' + (msg.trace_id || traceId || '-'),
                    );
                } else if (msg.type === 'feedback_error') {
                    cleanup();
                    ws.off('message', handler);
                    log(`[requestFeedback] feedback_error error=${msg.error || 'Feedback error'}`);
                    try { ws.close(); } catch { /* ignore */ }
                    reject(new Error(msg.error || 'Feedback error'));
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.on('message', handler);
        ws.once('close', () => {
            cleanup();
            ws.off('message', handler);
            log('[requestFeedback] WS closed during feedback wait — rejecting');
            reject(new Error(formatExtensionCloseError('feedback wait')));
        });

        ws.send(JSON.stringify({
            type: 'feedback_request',
            summary,
            project_directory: projectDirectory,
            ...(traceId ? { trace_id: traceId } : {}),
        }));
        log(`[requestFeedback] feedback_request_sent trace=${traceId || '-'} summary_len=${summary.length}`);

        log(
            `[requestFeedback] armed cursor_keepalive_ms=${cursorKeepaliveMs} `
            + `progress=${deps?.progressToken ? 'enabled' : 'disabled'} `
            + `trace=${traceId || '-'} project=${projectDirectory || '-'}`,
        );
    });
}
