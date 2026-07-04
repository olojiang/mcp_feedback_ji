import { getLogsDir } from './configPaths.js';
import {
    appendDailyRotatingLog,
    dailyLogFilePath,
    legacyLogAliasPath,
    localDateKey,
    localTimestamp,
    truncateDailyLog,
} from './dailyRotatingLog.js';

const LOG_BASE_NAME = 'webview';

let logDirOverride: string | null = null;

/** Test hook: redirect webview logs to a temp directory. */
export function setWebviewLogDirForTests(dir: string | null): void {
    logDirOverride = dir;
}

function resolveLogDir(): string {
    return logDirOverride ?? getLogsDir();
}

export function appendWebviewLog(msg: string, projectPath?: string): void {
    try {
        const prefix = projectPath ? `[${projectPath}] ` : '';
        const line = `[${localTimestamp()}] ${prefix}${msg}`;
        appendDailyRotatingLog(resolveLogDir(), LOG_BASE_NAME, line);
    } catch { /* ignore */ }
}

/** Path to today's webview log (dated file). */
export function webviewLogPath(): string {
    return dailyLogFilePath(resolveLogDir(), LOG_BASE_NAME, localDateKey());
}

/** Stable alias `webview.log` -> today's dated file. */
export function webviewLogAliasPath(): string {
    return legacyLogAliasPath(resolveLogDir(), LOG_BASE_NAME);
}

/** Clear today's webview log for clean repro/debug sessions. */
export function truncateWebviewLog(): string {
    return truncateDailyLog(resolveLogDir(), LOG_BASE_NAME);
}
