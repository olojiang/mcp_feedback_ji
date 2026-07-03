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
exports.setWebviewLogDirForTests = setWebviewLogDirForTests;
exports.appendWebviewLog = appendWebviewLog;
exports.webviewLogPath = webviewLogPath;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const DEFAULT_LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs');
const DEFAULT_LOG_FILE = 'webview.log';
const MAX_BYTES = 2 * 1024 * 1024;
let logDirOverride = null;
/** Test hook: redirect webview logs to a temp directory. */
function setWebviewLogDirForTests(dir) {
    logDirOverride = dir;
}
function resolveLogDir() {
    return logDirOverride ?? DEFAULT_LOG_DIR;
}
function appendWebviewLog(msg, projectPath) {
    try {
        const logDir = resolveLogDir();
        fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, DEFAULT_LOG_FILE);
        try {
            const stat = fs.statSync(logFile);
            if (stat.size > MAX_BYTES) {
                try {
                    fs.unlinkSync(logFile + '.old');
                }
                catch { /* ignore */ }
                fs.renameSync(logFile, logFile + '.old');
            }
        }
        catch { /* ignore */ }
        const prefix = projectPath ? `[${projectPath}] ` : '';
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${prefix}${msg}\n`);
    }
    catch { /* ignore */ }
}
function webviewLogPath() {
    return path.join(resolveLogDir(), DEFAULT_LOG_FILE);
}
//# sourceMappingURL=webviewLog.js.map