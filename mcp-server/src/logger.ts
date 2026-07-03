import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogsDir } from './configPaths.js';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

function logFilePath(): string {
    return path.join(getLogsDir(), 'mcp-server.log');
}

export function mcpLog(msg: string): void {
    const logDir = getLogsDir();
    const logFile = logFilePath();
    try {
        fs.mkdirSync(logDir, { recursive: true });
        try {
            const stat = fs.statSync(logFile);
            if (stat.size > MAX_LOG_BYTES) {
                try { fs.unlinkSync(`${logFile}.old`); } catch { /* ignore */ }
                fs.renameSync(logFile, `${logFile}.old`);
            }
        } catch { /* log file may not exist yet */ }
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch { /* never break MCP stdio for diagnostics */ }

    if (process.env.MCP_FEEDBACK_STDERR_LOGS === '1') {
        console.error(msg);
    }
}
