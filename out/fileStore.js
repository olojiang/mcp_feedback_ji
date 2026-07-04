"use strict";
/**
 * Centralized file I/O for all persistent state.
 * All paths under ~/.config/mcp-feedback-enhanced/ (or MCP_FEEDBACK_CONFIG_DIR).
 */
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
exports.SERVERS_DIR = exports.PROJECTS_DIR = exports.CONFIG_DIR = void 0;
exports.projectHash = projectHash;
exports.readProject = readProject;
exports.writeProject = writeProject;
exports.readServerByHash = readServerByHash;
exports.writeServer = writeServer;
exports.readRegistryLock = readRegistryLock;
exports.writeRegistryLock = writeRegistryLock;
exports.clearRegistryLock = clearRegistryLock;
exports.deleteServerByHash = deleteServerByHash;
exports.cleanupStaleServers = cleanupStaleServers;
exports.writeAgentContext = writeAgentContext;
exports.readAgentContext = readAgentContext;
exports.listAllServers = listAllServers;
exports.isTestRegistryEntry = isTestRegistryEntry;
exports.findTestRegistryEntries = findTestRegistryEntries;
exports.pruneTestRegistryEntries = pruneTestRegistryEntries;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const configPaths_1 = require("./configPaths");
Object.defineProperty(exports, "CONFIG_DIR", { enumerable: true, get: function () { return configPaths_1.getConfigDir; } });
Object.defineProperty(exports, "PROJECTS_DIR", { enumerable: true, get: function () { return configPaths_1.getProjectsDir; } });
Object.defineProperty(exports, "SERVERS_DIR", { enumerable: true, get: function () { return configPaths_1.getServersDir; } });
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
function safeReadJSON(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function safeWriteJSON(filePath, data) {
    ensureDir(path.dirname(filePath));
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
}
function safeDelete(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
    }
    catch { /* ignore */ }
    return false;
}
function listJSONFiles(dir) {
    try {
        if (!fs.existsSync(dir)) {
            return [];
        }
        return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    }
    catch {
        return [];
    }
}
function projectHash(workspacePath) {
    const normalized = path.normalize(workspacePath).replace(/\/+$/, '');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
function readProject(hash) {
    return safeReadJSON(path.join((0, configPaths_1.getProjectsDir)(), `${hash}.json`));
}
function writeProject(hash, data) {
    safeWriteJSON(path.join((0, configPaths_1.getProjectsDir)(), `${hash}.json`), data);
}
function readServerByHash(hash) {
    return safeReadJSON(path.join((0, configPaths_1.getServersDir)(), `${hash}.json`));
}
function writeServer(hash, data) {
    safeWriteJSON(path.join((0, configPaths_1.getServersDir)(), `${hash}.json`), data);
}
function readRegistryLock() {
    return safeReadJSON(path.join((0, configPaths_1.getServersDir)(), '_instance.lock.json'));
}
function writeRegistryLock(lock) {
    safeWriteJSON(path.join((0, configPaths_1.getServersDir)(), '_instance.lock.json'), lock);
}
function clearRegistryLock() {
    safeDelete(path.join((0, configPaths_1.getServersDir)(), '_instance.lock.json'));
}
function deleteServerByHash(hash) {
    return safeDelete(path.join((0, configPaths_1.getServersDir)(), `${hash}.json`));
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function cleanupStaleServers() {
    let cleaned = 0;
    for (const f of listJSONFiles((0, configPaths_1.getServersDir)())) {
        const filePath = path.join((0, configPaths_1.getServersDir)(), f);
        const info = safeReadJSON(filePath);
        if (info && !isProcessAlive(info.pid)) {
            safeDelete(filePath);
            cleaned++;
        }
    }
    return cleaned;
}
function writeAgentContext(workspaceRoots, traceId = '') {
    const roots = workspaceRoots.map((r) => r.replace(/\/+$/, '')).filter(Boolean);
    if (!roots.length)
        return;
    safeWriteJSON((0, configPaths_1.getAgentContextPath)(), {
        traceId,
        workspaceRoots: roots,
        updatedAt: Date.now(),
    });
}
function readAgentContext() {
    return safeReadJSON((0, configPaths_1.getAgentContextPath)());
}
function listAllServers() {
    const out = [];
    for (const f of listJSONFiles((0, configPaths_1.getServersDir)())) {
        const hash = f.replace(/\.json$/, '');
        const info = readServerByHash(hash);
        if (info)
            out.push({ ...info, hash });
    }
    return out.sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
}
function isTestRegistryEntry(info) {
    const version = String(info.version || '');
    if (!/^\d+\.\d+\.\d+(-ji\.\d+)?$/.test(version))
        return true;
    const p = String(info.projectPath || '');
    if (p.startsWith('/tmp/') || p.includes('/var/folders/'))
        return true;
    return false;
}
function findTestRegistryEntries() {
    return listAllServers().filter((s) => isTestRegistryEntry(s));
}
function pruneTestRegistryEntries(isAlive) {
    const removed = [];
    const skippedAlive = [];
    for (const entry of listAllServers()) {
        if (!isTestRegistryEntry(entry))
            continue;
        if (isAlive(entry.pid)) {
            skippedAlive.push({
                hash: entry.hash,
                pid: entry.pid,
                version: entry.version,
                projectPath: entry.projectPath,
            });
            continue;
        }
        if (deleteServerByHash(entry.hash))
            removed.push(entry.hash);
    }
    return { removed, skippedAlive };
}
//# sourceMappingURL=fileStore.js.map