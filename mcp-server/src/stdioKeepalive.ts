import {
    feedbackWaitHeartbeatLine,
    shouldLogStdioKeepalive,
    STDIO_KEEPALIVE_MS,
} from './feedbackWait.js';
import { mcpLog } from './logger.js';

export { STDIO_KEEPALIVE_MS };

export interface StdioKeepaliveServer {
    sendLoggingMessage(params: {
        level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
        data: string;
    }): Promise<void>;
}

export interface StdioKeepaliveTickOptions {
    /** Override file logger (tests). Protocol sendLoggingMessage is always invoked. */
    log?: (message: string) => void;
}

export function createStdioKeepaliveTick(
    server: StdioKeepaliveServer,
    opts?: StdioKeepaliveTickOptions,
): (traceId?: string, projectDirectory?: string) => void {
    let tick = 0;
    const log = opts?.log ?? mcpLog;
    return (traceId?: string, projectDirectory?: string) => {
        tick += 1;
        const line = feedbackWaitHeartbeatLine(traceId, projectDirectory);
        if (shouldLogStdioKeepalive(tick)) {
            log(`event=stdio_keepalive tick=${tick} ${line}`);
        }
        void server.sendLoggingMessage({
            level: 'info',
            data: line,
        }).catch(() => {
            // Client may not subscribe to logging; keepalive is best-effort.
        });
    };
}
