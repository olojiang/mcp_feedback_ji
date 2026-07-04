import { getLogsDir } from './configPaths.js';
import { appendDailyRotatingLog } from './dailyRotatingLog.js';
import { createBatchedLogger, formatStructuredLine, type LogComponent, type StructuredLogFields } from './structuredFileLog.js';

const LOG_BASE_NAME = 'extension';

let hubLogger: ReturnType<typeof createBatchedLogger> | null = null;

function getHubLogger() {
    if (!hubLogger) {
        hubLogger = createBatchedLogger('', {
            append(_filePath, line) {
                try {
                    appendDailyRotatingLog(getLogsDir(), LOG_BASE_NAME, line);
                } catch { /* ignore */ }
            },
        });
    }
    return hubLogger;
}

export function hubLog(msg: string): void {
    getHubLogger().append(`[${new Date().toISOString()}] ${msg}`);
}

export function hubStructuredLog(
    event: string,
    fields: StructuredLogFields = {},
    component: LogComponent = 'hub',
): void {
    hubLog(formatStructuredLine(component, event, fields));
}

export function flushHubLog(): void {
    hubLogger?.flush();
}

export function resetHubLoggerForTests(): void {
    hubLogger?.flush();
    hubLogger = null;
}
