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
exports.PENDING_PERSIST_MAX_AGE_MS = void 0;
exports.isPersistedSessionExpired = isPersistedSessionExpired;
exports.pendingSessionsFilePath = pendingSessionsFilePath;
exports.writePersistedPendingSessions = writePersistedPendingSessions;
exports.readPersistedPendingSessions = readPersistedPendingSessions;
exports.clearPersistedPendingSessions = clearPersistedPendingSessions;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const configPaths_js_1 = require("./configPaths.js");
const fileStore_js_1 = require("./fileStore.js");
/** Drop persisted pending older than this (default 24h). */
exports.PENDING_PERSIST_MAX_AGE_MS = readMaxAgeMs();
function readMaxAgeMs() {
    const n = Number(process.env.MCP_FEEDBACK_PENDING_MAX_AGE_MS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400000;
}
function isPersistedSessionExpired(session, now = Date.now(), maxAgeMs = exports.PENDING_PERSIST_MAX_AGE_MS) {
    const anchor = session.enqueuedAt ?? 0;
    if (!anchor)
        return false;
    return now - anchor > maxAgeMs;
}
function pendingSessionsFilePath(workspaces) {
    const primary = workspaces[0] || '_default';
    return path.join((0, configPaths_js_1.getConfigDir)(), 'pending-sessions', `${(0, fileStore_js_1.projectHash)(primary)}.json`);
}
function ensureParent(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
function writePersistedPendingSessions(workspaces, sessions, extras) {
    if (!workspaces.length)
        return;
    const filePath = pendingSessionsFilePath(workspaces);
    if (!sessions.length && !(extras?.pendingComments?.length) && !(extras?.pendingImages?.length)) {
        try {
            if (fs.existsSync(filePath))
                fs.unlinkSync(filePath);
        }
        catch { /* ignore */ }
        return;
    }
    const payload = {
        workspaces: [...workspaces],
        savedAt: Date.now(),
        sessions,
        ...(extras?.pendingComments?.length ? { pendingComments: extras.pendingComments } : {}),
        ...(extras?.pendingImages?.length ? { pendingImages: extras.pendingImages } : {}),
    };
    ensureParent(filePath);
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, filePath);
}
function readPersistedPendingSessions(workspaces) {
    if (!workspaces.length)
        return null;
    const filePath = pendingSessionsFilePath(workspaces);
    try {
        if (!fs.existsSync(filePath))
            return null;
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!raw?.sessions?.length)
            return null;
        const want = workspaces.map((w) => (0, fileStore_js_1.projectHash)(w)).sort().join(',');
        const got = (raw.workspaces || []).map((w) => (0, fileStore_js_1.projectHash)(w)).sort().join(',');
        if (want !== got)
            return null;
        return raw;
    }
    catch {
        return null;
    }
}
function clearPersistedPendingSessions(workspaces) {
    writePersistedPendingSessions(workspaces, []);
}
//# sourceMappingURL=pendingSessionStore.js.map