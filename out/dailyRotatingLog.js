"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAILY_LOG_RETENTION_DAYS = void 0;
exports.localDateKey = localDateKey;
exports.localTimestamp = localTimestamp;
exports.dailyLogFileName = dailyLogFileName;
exports.dailyLogFilePath = dailyLogFilePath;
exports.legacyLogAliasPath = legacyLogAliasPath;
exports.parseDailyLogDateKey = parseDailyLogDateKey;
exports.pruneOldDailyLogs = pruneOldDailyLogs;
exports.appendDailyRotatingLog = appendDailyRotatingLog;
exports.truncateDailyLog = truncateDailyLog;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.DAILY_LOG_RETENTION_DAYS = 7;
/** Local calendar date key YYYY-MM-DD (matches user-facing "today"). */
function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/** Local timezone timestamp: YYYY-MM-DDTHH:mm:ss.SSS+HH:MM */
function localTimestamp(date = new Date()) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const mo = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const h = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    const off = -date.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const offH = pad2(Math.floor(Math.abs(off) / 60));
    const offM = pad2(Math.abs(off) % 60);
    return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${offH}:${offM}`;
}
function dailyLogFileName(baseName, dateKey) {
    return `${baseName}-${dateKey}.log`;
}
function dailyLogFilePath(logDir, baseName, dateKey) {
    return path.join(logDir, dailyLogFileName(baseName, dateKey ?? localDateKey()));
}
function legacyLogAliasPath(logDir, baseName) {
    return path.join(logDir, `${baseName}.log`);
}
function parseDailyLogDateKey(fileName, baseName) {
    const prefix = `${baseName}-`;
    const suffix = '.log';
    if (!fileName.startsWith(prefix) || !fileName.endsWith(suffix))
        return null;
    const key = fileName.slice(prefix.length, -suffix.length);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}
function pruneOldDailyLogs(logDir, baseName, retentionDays = exports.DAILY_LOG_RETENTION_DAYS, now = new Date()) {
    const removed = [];
    let entries = [];
    try {
        entries = fs.readdirSync(logDir);
    }
    catch {
        return removed;
    }
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays + 1);
    cutoff.setHours(0, 0, 0, 0);
    for (const name of entries) {
        const key = parseDailyLogDateKey(name, baseName);
        if (!key)
            continue;
        const fileDate = new Date(`${key}T00:00:00`);
        if (fileDate >= cutoff)
            continue;
        try {
            fs.unlinkSync(path.join(logDir, name));
            removed.push(name);
        }
        catch { /* ignore */ }
    }
    return removed;
}
function migrateLegacyLogFile(logDir, baseName, todayPath) {
    const alias = legacyLogAliasPath(logDir, baseName);
    try {
        const stat = fs.lstatSync(alias);
        if (stat.isSymbolicLink())
            return;
    }
    catch {
        return;
    }
    if (fs.existsSync(todayPath))
        return;
    try {
        fs.renameSync(alias, todayPath);
    }
    catch { /* ignore */ }
}
function updateLegacySymlink(logDir, baseName, todayPath) {
    const alias = legacyLogAliasPath(logDir, baseName);
    const relativeTarget = path.basename(todayPath);
    try {
        const stat = fs.lstatSync(alias);
        if (stat.isSymbolicLink()) {
            const current = fs.readlinkSync(alias);
            if (current === relativeTarget || current === todayPath)
                return;
            fs.unlinkSync(alias);
        }
        else {
            return;
        }
    }
    catch {
        /* alias missing */
    }
    try {
        fs.symlinkSync(relativeTarget, alias);
    }
    catch { /* ignore */ }
}
/** Append one line to today's daily log; keep 7 days; maintain baseName.log symlink. */
function appendDailyRotatingLog(logDir, baseName, line, now = new Date()) {
    fs.mkdirSync(logDir, { recursive: true });
    const todayKey = localDateKey(now);
    const todayPath = dailyLogFilePath(logDir, baseName, todayKey);
    migrateLegacyLogFile(logDir, baseName, todayPath);
    fs.appendFileSync(todayPath, line + '\n');
    updateLegacySymlink(logDir, baseName, todayPath);
    pruneOldDailyLogs(logDir, baseName, exports.DAILY_LOG_RETENTION_DAYS, new Date());
    return todayPath;
}
/** Clear today's daily log (truncate). Returns path truncated. */
function truncateDailyLog(logDir, baseName, now = new Date()) {
    fs.mkdirSync(logDir, { recursive: true });
    const todayPath = dailyLogFilePath(logDir, baseName, localDateKey(now));
    migrateLegacyLogFile(logDir, baseName, todayPath);
    fs.writeFileSync(todayPath, '', 'utf8');
    updateLegacySymlink(logDir, baseName, todayPath);
    return todayPath;
}
//# sourceMappingURL=dailyRotatingLog.js.map