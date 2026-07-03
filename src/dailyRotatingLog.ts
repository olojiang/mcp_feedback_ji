import * as fs from 'node:fs';
import * as path from 'node:path';

export const DAILY_LOG_RETENTION_DAYS = 7;

/** Local calendar date key YYYY-MM-DD (matches user-facing "today"). */
export function localDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function dailyLogFileName(baseName: string, dateKey: string): string {
    return `${baseName}-${dateKey}.log`;
}

export function dailyLogFilePath(logDir: string, baseName: string, dateKey?: string): string {
    return path.join(logDir, dailyLogFileName(baseName, dateKey ?? localDateKey()));
}

export function legacyLogAliasPath(logDir: string, baseName: string): string {
    return path.join(logDir, `${baseName}.log`);
}

export function parseDailyLogDateKey(fileName: string, baseName: string): string | null {
    const prefix = `${baseName}-`;
    const suffix = '.log';
    if (!fileName.startsWith(prefix) || !fileName.endsWith(suffix)) return null;
    const key = fileName.slice(prefix.length, -suffix.length);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function pruneOldDailyLogs(
    logDir: string,
    baseName: string,
    retentionDays = DAILY_LOG_RETENTION_DAYS,
    now: Date = new Date(),
): string[] {
    const removed: string[] = [];
    let entries: string[] = [];
    try {
        entries = fs.readdirSync(logDir);
    } catch {
        return removed;
    }
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays + 1);
    cutoff.setHours(0, 0, 0, 0);

    for (const name of entries) {
        const key = parseDailyLogDateKey(name, baseName);
        if (!key) continue;
        const fileDate = new Date(`${key}T00:00:00`);
        if (fileDate >= cutoff) continue;
        try {
            fs.unlinkSync(path.join(logDir, name));
            removed.push(name);
        } catch { /* ignore */ }
    }
    return removed;
}

function migrateLegacyLogFile(logDir: string, baseName: string, todayPath: string): void {
    const alias = legacyLogAliasPath(logDir, baseName);
    try {
        const stat = fs.lstatSync(alias);
        if (stat.isSymbolicLink()) return;
    } catch {
        return;
    }
    if (fs.existsSync(todayPath)) return;
    try {
        fs.renameSync(alias, todayPath);
    } catch { /* ignore */ }
}

function updateLegacySymlink(logDir: string, baseName: string, todayPath: string): void {
    const alias = legacyLogAliasPath(logDir, baseName);
    const relativeTarget = path.basename(todayPath);
    try {
        const stat = fs.lstatSync(alias);
        if (stat.isSymbolicLink()) {
            const current = fs.readlinkSync(alias);
            if (current === relativeTarget || current === todayPath) return;
            fs.unlinkSync(alias);
        } else {
            return;
        }
    } catch {
        /* alias missing */
    }
    try {
        fs.symlinkSync(relativeTarget, alias);
    } catch { /* ignore */ }
}

/** Append one line to today's daily log; keep 7 days; maintain baseName.log symlink. */
export function appendDailyRotatingLog(
    logDir: string,
    baseName: string,
    line: string,
    now: Date = new Date(),
): string {
    fs.mkdirSync(logDir, { recursive: true });
    const todayKey = localDateKey(now);
    const todayPath = dailyLogFilePath(logDir, baseName, todayKey);
    migrateLegacyLogFile(logDir, baseName, todayPath);
    fs.appendFileSync(todayPath, line + '\n');
    updateLegacySymlink(logDir, baseName, todayPath);
    pruneOldDailyLogs(logDir, baseName, DAILY_LOG_RETENTION_DAYS, new Date());
    return todayPath;
}

/** Clear today's daily log (truncate). Returns path truncated. */
export function truncateDailyLog(
    logDir: string,
    baseName: string,
    now: Date = new Date(),
): string {
    fs.mkdirSync(logDir, { recursive: true });
    const todayPath = dailyLogFilePath(logDir, baseName, localDateKey(now));
    migrateLegacyLogFile(logDir, baseName, todayPath);
    fs.writeFileSync(todayPath, '', 'utf8');
    updateLegacySymlink(logDir, baseName, todayPath);
    return todayPath;
}
