import { execSync } from 'node:child_process';

let cachedNodeBin: string | null = null;

/** Resolve `node` for configs spawned by Cursor (hooks, MCP). Cached after first call. */
export function resolveNodeBin(exec: typeof execSync = execSync): string {
    if (cachedNodeBin) return cachedNodeBin;
    try {
        if (process.platform === 'win32') {
            const out = exec('where.exe node', { encoding: 'utf-8', timeout: 5000, env: process.env });
            const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
            if (first) {
                cachedNodeBin = first;
                return first;
            }
        } else {
            const resolved = exec('which node', { encoding: 'utf-8', timeout: 5000, env: process.env }).trim();
            if (resolved) {
                cachedNodeBin = resolved;
                return resolved;
            }
        }
    } catch { /* fall through */ }
    cachedNodeBin = 'node';
    return cachedNodeBin;
}

export function resetNodeBinCacheForTests(): void {
    cachedNodeBin = null;
}
