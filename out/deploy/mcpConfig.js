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
exports.planMcpConfigUpdate = planMcpConfigUpdate;
exports.applyMcpConfigPlan = applyMcpConfigPlan;
const path = __importStar(require("node:path"));
/** Pure plan for ~/.cursor/mcp.json mcp-feedback-enhanced entry. */
function planMcpConfigUpdate(extensionPath, version, nodeBin, existing) {
    const localServerPath = path.join(extensionPath, 'mcp-server', 'dist', 'index.js');
    const entry = {
        command: nodeBin,
        args: [localServerPath],
        env: {
            MCP_FEEDBACK_VERSION: version,
            MCP_FEEDBACK_CURSOR_KEEPALIVE_MS: '0',
            MCP_FEEDBACK_CURSOR_PROGRESS_MS: '25000',
        },
    };
    const existingEnv = (existing?.env || {});
    const unchanged = existing?.command === entry.command
        && JSON.stringify(existing?.args) === JSON.stringify(entry.args)
        && existingEnv.MCP_FEEDBACK_VERSION === version
        && existingEnv.MCP_FEEDBACK_CURSOR_KEEPALIVE_MS === entry.env.MCP_FEEDBACK_CURSOR_KEEPALIVE_MS
        && existingEnv.MCP_FEEDBACK_CURSOR_PROGRESS_MS === entry.env.MCP_FEEDBACK_CURSOR_PROGRESS_MS;
    return {
        changed: !unchanged,
        entry,
        removeLegacy: ['mcp-feedback-v2'],
    };
}
function applyMcpConfigPlan(config, plan) {
    const mcpServers = { ...(config.mcpServers || {}) };
    for (const legacy of plan.removeLegacy) {
        delete mcpServers[legacy];
    }
    mcpServers['mcp-feedback-enhanced'] = plan.entry;
    return { ...config, mcpServers };
}
//# sourceMappingURL=mcpConfig.js.map