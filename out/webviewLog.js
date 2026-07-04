"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setWebviewLogDirForTests = setWebviewLogDirForTests;
exports.appendWebviewLog = appendWebviewLog;
exports.webviewLogPath = webviewLogPath;
exports.webviewLogAliasPath = webviewLogAliasPath;
exports.truncateWebviewLog = truncateWebviewLog;
const configPaths_js_1 = require("./configPaths.js");
const dailyRotatingLog_js_1 = require("./dailyRotatingLog.js");
const LOG_BASE_NAME = 'webview';
let logDirOverride = null;
/** Test hook: redirect webview logs to a temp directory. */
function setWebviewLogDirForTests(dir) {
    logDirOverride = dir;
}
function resolveLogDir() {
    return logDirOverride ?? (0, configPaths_js_1.getLogsDir)();
}
function appendWebviewLog(msg, projectPath) {
    try {
        const prefix = projectPath ? `[${projectPath}] ` : '';
        const line = `[${(0, dailyRotatingLog_js_1.localTimestamp)()}] ${prefix}${msg}`;
        (0, dailyRotatingLog_js_1.appendDailyRotatingLog)(resolveLogDir(), LOG_BASE_NAME, line);
    }
    catch { /* ignore */ }
}
/** Path to today's webview log (dated file). */
function webviewLogPath() {
    return (0, dailyRotatingLog_js_1.dailyLogFilePath)(resolveLogDir(), LOG_BASE_NAME, (0, dailyRotatingLog_js_1.localDateKey)());
}
/** Stable alias `webview.log` -> today's dated file. */
function webviewLogAliasPath() {
    return (0, dailyRotatingLog_js_1.legacyLogAliasPath)(resolveLogDir(), LOG_BASE_NAME);
}
/** Clear today's webview log for clean repro/debug sessions. */
function truncateWebviewLog() {
    return (0, dailyRotatingLog_js_1.truncateDailyLog)(resolveLogDir(), LOG_BASE_NAME);
}
//# sourceMappingURL=webviewLog.js.map