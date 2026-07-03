import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs');
const DEFAULT_LOG_FILE = 'webview.log';
const MAX_BYTES = 2 * 1024 * 1024;

let logDirOverride: string | null = null;

/** Test hook: redirect webview logs to a temp directory. */
export function setWebviewLogDirForTests(dir: string | null): void {
    logDirOverride = dir;
}

function resolveLogDir(): string {
    return logDirOverride ?? DEFAULT_LOG_DIR;
}

export function appendWebviewLog(msg: string, projectPath?: string): void {
    try {
        const logDir = resolveLogDir();
        fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, DEFAULT_LOG_FILE);
        try {
            const stat = fs.statSync(logFile);
            if (stat.size > MAX_BYTES) {
                try { fs.unlinkSync(logFile + '.old'); } catch { /* ignore */ }
                fs.renameSync(logFile, logFile + '.old');
            }
        } catch { /* ignore */ }
        const prefix = projectPath ? `[${projectPath}] ` : '';
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${prefix}${msg}\n`);
    } catch { /* ignore */ }
}

export function webviewLogPath(): string {
    return path.join(resolveLogDir(), DEFAULT_LOG_FILE);
}
