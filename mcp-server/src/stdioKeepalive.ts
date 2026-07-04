import { feedbackWaitHeartbeatLine, STDIO_KEEPALIVE_MS } from './feedbackWait.js';
import { mcpLog } from './logger.js';

export { STDIO_KEEPALIVE_MS };

export interface StdioKeepaliveServer {
    sendLoggingMessage(params: { level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'; data: string }): Promise<void>;
}

export function createStdioKeepaliveTick(
    server: StdioKeepaliveServer,
): (traceId?: string, projectDirectory?: string) => void {
    return (traceId?: string, projectDirectory?: string) => {
        const line = feedbackWaitHeartbeatLine(traceId, projectDirectory);
        mcpLog(`event=stdio_keepalive ${line}`);
        void server.sendLoggingMessage({
            level: 'info',
            data: line,
        }).catch(() => {
            // Client may not subscribe to logging; keepalive is best-effort.
        });
    };
}
