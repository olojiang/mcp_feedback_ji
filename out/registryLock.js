"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAcquireRegistryLock = canAcquireRegistryLock;
exports.registryLockPath = registryLockPath;
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
function registryLockPath(serversDir) {
    return `${serversDir}/_instance.lock.json`;
}
function writeServersBatch(deps) {
    const now = deps.now ?? Date.now();
    const lock = {
        pid: deps.info.pid,
        port: deps.info.port,
        acquired_at: now,
        workspaces: deps.workspaces.slice(),
    };
    const existing = deps.readLock();
    if (!canAcquireRegistryLock(existing, lock, deps.isAlive, now)) {
        return { ok: false, reason: 'registry_locked', hashes: [] };
    }
    deps.writeLock(lock);
    const hashes = [];
    for (const ws of deps.workspaces) {
        const hash = deps.projectHash(ws);
        deps.writeServer(hash, {
            port: deps.info.port,
            pid: deps.info.pid,
            version: deps.info.version,
            started_at: deps.info.started_at,
            projectPath: ws,
        });
        hashes.push(hash);
    }
    return { ok: true, hashes };
}
function releaseRegistryLockIfOwner(existing, pid) {
    return !!(existing && existing.pid === pid);
}
//# sourceMappingURL=registryLock.js.map