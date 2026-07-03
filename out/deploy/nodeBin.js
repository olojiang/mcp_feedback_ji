"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveNodeBin = resolveNodeBin;
exports.resetNodeBinCacheForTests = resetNodeBinCacheForTests;
const node_child_process_1 = require("node:child_process");
let cachedNodeBin = null;
/** Resolve `node` for configs spawned by Cursor (hooks, MCP). Cached after first call. */
function resolveNodeBin(exec = node_child_process_1.execSync) {
    if (cachedNodeBin)
        return cachedNodeBin;
    try {
        if (process.platform === 'win32') {
            const out = exec('where.exe node', { encoding: 'utf-8', timeout: 5000, env: process.env });
            const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
            if (first) {
                cachedNodeBin = first;
                return first;
            }
        }
        else {
            const resolved = exec('which node', { encoding: 'utf-8', timeout: 5000, env: process.env }).trim();
            if (resolved) {
                cachedNodeBin = resolved;
                return resolved;
            }
        }
    }
    catch { /* fall through */ }
    cachedNodeBin = 'node';
    return cachedNodeBin;
}
function resetNodeBinCacheForTests() {
    cachedNodeBin = null;
}
//# sourceMappingURL=nodeBin.js.map