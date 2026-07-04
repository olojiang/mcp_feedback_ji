"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setExtensionLogDirForTests = setExtensionLogDirForTests;
exports.hubLog = hubLog;
exports.hubStructuredLog = hubStructuredLog;
exports.flushHubLog = flushHubLog;
exports.resetHubLoggerForTests = resetHubLoggerForTests;
const configPaths_js_1 = require("./configPaths.js");
const dailyRotatingLog_js_1 = require("./dailyRotatingLog.js");
const structuredFileLog_js_1 = require("./structuredFileLog.js");
const LOG_BASE_NAME = 'extension';
let logDirOverride = null;
/** Test hook: redirect extension logs to a temp directory. */
function setExtensionLogDirForTests(dir) {
    logDirOverride = dir;
}
function resolveLogDir() {
    return logDirOverride ?? (0, configPaths_js_1.getLogsDir)();
}
let hubLogger = null;
function getHubLogger() {
    if (!hubLogger) {
        hubLogger = (0, structuredFileLog_js_1.createBatchedLogger)('', {
            append(_filePath, line) {
                try {
                    (0, dailyRotatingLog_js_1.appendDailyRotatingLog)(resolveLogDir(), LOG_BASE_NAME, line);
                }
                catch { /* ignore */ }
            },
        });
    }
    return hubLogger;
}
function hubLog(msg) {
    getHubLogger().append(`[${(0, dailyRotatingLog_js_1.localTimestamp)()}] ${msg}`);
}
function hubStructuredLog(event, fields = {}, component = 'hub') {
    hubLog((0, structuredFileLog_js_1.formatStructuredLine)(component, event, fields));
}
function flushHubLog() {
    hubLogger?.flush();
}
function resetHubLoggerForTests() {
    hubLogger?.flush();
    hubLogger = null;
}
//# sourceMappingURL=extensionFileLog.js.map