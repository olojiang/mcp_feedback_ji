export declare const DAILY_LOG_RETENTION_DAYS = 7;
/** Local calendar date key YYYY-MM-DD (matches user-facing "today"). */
export declare function localDateKey(date?: Date): string;
export declare function dailyLogFileName(baseName: string, dateKey: string): string;
export declare function dailyLogFilePath(logDir: string, baseName: string, dateKey?: string): string;
export declare function legacyLogAliasPath(logDir: string, baseName: string): string;
export declare function parseDailyLogDateKey(fileName: string, baseName: string): string | null;
export declare function pruneOldDailyLogs(logDir: string, baseName: string, retentionDays?: number, now?: Date): string[];
/** Append one line to today's daily log; keep 7 days; maintain baseName.log symlink. */
export declare function appendDailyRotatingLog(logDir: string, baseName: string, line: string, now?: Date): string;
/** Clear today's daily log (truncate). Returns path truncated. */
export declare function truncateDailyLog(logDir: string, baseName: string, now?: Date): string;
