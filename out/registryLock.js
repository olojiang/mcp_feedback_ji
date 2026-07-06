"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAcquireRegistryLock = canAcquireRegistryLock;
exports.registryLockPath = registryLockPath;
exports.staleWorkspaceHashes = staleWorkspaceHashes;
exports.writeServersBatch = writeServersBatch;
exports.releaseRegistryLockIfOwner = releaseRegistryLockIfOwner;
/** Whether this hub instance may write registry files for the given workspaces. */
function canAcquireRegistryLock(existing, owner, isAlive, now, staleMs = 10000) {
    if (!existing)
        return true;
    if (existing.pid === owner.pid)
        return true;
    if (!isAlive(existing.pid))
        return true;
    if (now - existing.acquired_at > staleMs)
        return true;
    return false;
}
function registryLockPath(serversDir, hash) {
    return hash ? `${serversDir}/_instance.${hash}.lock.json` : `${serversDir}/_instance.lock.json`;
}
function staleWorkspaceHashes(previousWorkspaces, nextWorkspaces, projectHash) {
    const next = new Set(nextWorkspaces.map((workspace) => projectHash(workspace)));
    return previousWorkspaces
        .map((workspace) => projectHash(workspace))
        .filter((hash) => !next.has(hash));
}
function writeServersBatch(deps) {
    const now = deps.now ?? Date.now();
    const entries = deps.workspaces.map((workspace) => ({
        workspace,
        hash: deps.projectHash(workspace),
    }));
    for (const entry of entries) {
        const lock = {
            pid: deps.info.pid,
            port: deps.info.port,
            acquired_at: now,
            workspaces: [entry.workspace],
        };
        const existing = deps.readLock(entry.hash);
        if (!canAcquireRegistryLock(existing, lock, deps.isAlive, now)) {
            return { ok: false, reason: 'registry_locked', hashes: [] };
        }
    }
    const hashes = [];
    for (const entry of entries) {
        const lock = {
            pid: deps.info.pid,
            port: deps.info.port,
            acquired_at: now,
            workspaces: [entry.workspace],
        };
        deps.writeLock(entry.hash, lock);
        deps.writeServer(entry.hash, {
            port: deps.info.port,
            pid: deps.info.pid,
            version: deps.info.version,
            started_at: deps.info.started_at,
            projectPath: entry.workspace,
        });
        hashes.push(entry.hash);
    }
    return { ok: true, hashes };
}
function releaseRegistryLockIfOwner(existing, pid) {
    return !!(existing && existing.pid === pid);
}
//# sourceMappingURL=registryLock.js.map