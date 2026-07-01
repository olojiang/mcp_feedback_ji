"use strict";
/**
 * Centralized file I/O for all persistent state.
 * All paths under ~/.config/mcp-feedback-enhanced/
 *
 * Directory structure:
 *   projects/<hash>.json   - Chat history per project
 *   servers/<hash>.json    - Extension instance registry (keyed by project hash)
 *   logs/
 *
 * Note: Pending messages are stored in-memory and served via HTTP.
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
exports.deleteServerByHash = deleteServerByHash;
exports.cleanupStaleServers = cleanupStaleServers;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const CONFIG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced');
exports.CONFIG_DIR = CONFIG_DIR;
const PROJECTS_DIR = path.join(CONFIG_DIR, 'projects');
exports.PROJECTS_DIR = PROJECTS_DIR;
const SERVERS_DIR = path.join(CONFIG_DIR, 'servers');
exports.SERVERS_DIR = SERVERS_DIR;
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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
// ─── Project Hash ─────────────────────────────────────────
function projectHash(workspacePath) {
    const normalized = path.normalize(workspacePath).replace(/\/+$/, '');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
// ─── Projects ─────────────────────────────────────────────
function readProject(hash) {
    return safeReadJSON(path.join(PROJECTS_DIR, `${hash}.json`));
}
function writeProject(hash, data) {
    safeWriteJSON(path.join(PROJECTS_DIR, `${hash}.json`), data);
}
// ─── Servers (keyed by project hash) ─────────────────────
function readServerByHash(hash) {
    return safeReadJSON(path.join(SERVERS_DIR, `${hash}.json`));
}
function writeServer(hash, data) {
    safeWriteJSON(path.join(SERVERS_DIR, `${hash}.json`), data);
}
function deleteServerByHash(hash) {
    return safeDelete(path.join(SERVERS_DIR, `${hash}.json`));
}
// ─── Cleanup Utilities ───────────────────────────────────
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
    for (const f of listJSONFiles(SERVERS_DIR)) {
        const info = safeReadJSON(path.join(SERVERS_DIR, f));
        if (info && !isProcessAlive(info.pid)) {
            safeDelete(path.join(SERVERS_DIR, f));
            cleaned++;
        }
    }
    return cleaned;
}
//# sourceMappingURL=fileStore.js.map