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
exports.feedbackLogDir = feedbackLogDir;
exports.resolveFeedbackLogPath = resolveFeedbackLogPath;
exports.formatAgentLinkStatus = formatAgentLinkStatus;
const path = __importStar(require("node:path"));
const configPaths_1 = require("./configPaths");
const webviewLog_1 = require("./webviewLog");
const dailyRotatingLog_1 = require("./dailyRotatingLog");
function feedbackLogDir() {
    return (0, configPaths_1.getLogsDir)();
}
function resolveFeedbackLogPath(target) {
    const logDir = (0, configPaths_1.getLogsDir)();
    switch (target) {
        case 'extension':
            return (0, dailyRotatingLog_1.dailyLogFilePath)(logDir, 'extension', (0, dailyRotatingLog_1.localDateKey)());
        case 'mcp-server':
            return path.join(logDir, 'mcp-server.log');
        case 'webview':
            return (0, webviewLog_1.webviewLogPath)();
        default:
            return logDir;
    }
}
/** Human-readable agent link status for the panel status bar. */
function formatAgentLinkStatus(mcpServers, pendingCount, mcpDetached) {
    if (mcpDetached > 0) {
        return 'Agent: waiting (link lost)';
    }
    if (mcpServers > 0) {
        return mcpServers === 1 ? 'Agent: live' : `Agent: live×${mcpServers}`;
    }
    if (pendingCount > 0) {
        return 'Agent: offline';
    }
    return 'Agent: idle';
}
//# sourceMappingURL=logPaths.js.map