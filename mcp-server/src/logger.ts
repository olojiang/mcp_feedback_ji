import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogsDir } from './configPaths.js';

const LOG_BASE_NAME = 'mcp-server';
const DAILY_LOG_RETENTION_DAYS = 7;

function localDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function dailyLogFilePath(logDir: string, dateKey?: string): string {
    return path.join(logDir, `${LOG_BASE_NAME}-${dateKey ?? localDateKey()}.log`);
}

function legacyAliasPath(logDir: string): string {
    return path.join(logDir, `${LOG_BASE_NAME}.log`);
}

function migrateLegacy(logDir: string, todayPath: string): void {
    const alias = legacyAliasPath(logDir);
    try {
        const stat = fs.lstatSync(alias);
        if (stat.isSymbolicLink()) return;
    } catch { return; }
    if (fs.existsSync(todayPath)) return;
    try { fs.renameSync(alias, todayPath); } catch { /* ignore */ }
}

function updateSymlink(logDir: string, todayPath: string): void {
    const alias = legacyAliasPath(logDir);
    const relativeTarget = path.basename(todayPath);
    try {
        const stat = fs.lstatSync(alias);
        if (stat.isSymbolicLink()) {
            const current = fs.readlinkSync(alias);
            if (current === relativeTarget || current === todayPath) return;
            fs.unlinkSync(alias);
        } else { return; }
    } catch { /* alias missing */ }
    try { fs.symlinkSync(relativeTarget, alias); } catch { /* ignore */ }
}

function pruneOldLogs(logDir: string, now: Date = new Date()): void {
    let entries: string[] = [];
    try { entries = fs.readdirSync(logDir); } catch { return; }
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - DAILY_LOG_RETENTION_DAYS + 1);
    cutoff.setHours(0, 0, 0, 0);
    const prefix = `${LOG_BASE_NAME}-`;
    const suffix = '.log';
    for (const name of entries) {
        if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
        const key = name.slice(prefix.length, -suffix.length);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
        const fileDate = new Date(`${key}T00:00:00`);
        if (fileDate >= cutoff) continue;
        try { fs.unlinkSync(path.join(logDir, name)); } catch { /* ignore */ }
    }
}

export function mcpLog(msg: string): void {
    const logDir = getLogsDir();
    const todayPath = dailyLogFilePath(logDir);
    try {
        fs.mkdirSync(logDir, { recursive: true });
        migrateLegacy(logDir, todayPath);
        fs.appendFileSync(todayPath, `[${new Date().toISOString()}] ${msg}\n`);
        updateSymlink(logDir, todayPath);
        pruneOldLogs(logDir);
    } catch { /* never break MCP stdio for diagnostics */ }

    if (process.env.MCP_FEEDBACK_STDERR_LOGS === '1') {
        console.error(msg);
    }
}
