import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogsDir } from './configPaths.js';
import { createBatchedLogger, formatStructuredLine, type LogComponent, type StructuredLogFields } from './structuredFileLog.js';

let hubLogger: ReturnType<typeof createBatchedLogger> | null = null;

function logFilePath(): string {
    return path.join(getLogsDir(), 'extension.log');
}

function getHubLogger() {
    if (!hubLogger) {
        hubLogger = createBatchedLogger(logFilePath(), {
            append(filePath, line) {
                try {
                    fs.mkdirSync(path.dirname(filePath), { recursive: true });
                    try {
                        const stat = fs.statSync(filePath);
                        if (stat.size > 2 * 1024 * 1024) {
                            try { fs.unlinkSync(filePath + '.old'); } catch { /* ignore */ }
                            fs.renameSync(filePath, filePath + '.old');
                        }
                    } catch { /* ignore */ }
                    fs.appendFileSync(filePath, line + '\n');
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
