import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mcp-server.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

export function mcpLog(msg: string): void {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        try {
            const stat = fs.statSync(LOG_FILE);
            if (stat.size > MAX_LOG_BYTES) {
                try { fs.unlinkSync(`${LOG_FILE}.old`); } catch { /* ignore */ }
                fs.renameSync(LOG_FILE, `${LOG_FILE}.old`);
            }
        } catch { /* log file may not exist yet */ }
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
    } catch { /* never break MCP stdio for diagnostics */ }

    if (process.env.MCP_FEEDBACK_STDERR_LOGS === '1') {
        console.error(msg);
    }
}
