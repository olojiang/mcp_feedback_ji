export interface RegistryLock {
    pid: number;
    port: number;
    acquired_at: number;
    workspaces: string[];
}

/** Whether this hub instance may write registry files for the given workspaces. */
export function canAcquireRegistryLock(
    existing: RegistryLock | null,
    owner: RegistryLock,
    isAlive: (pid: number) => boolean,
    now: number,
    staleMs = 10_000,
): boolean {
    if (!existing) return true;
    if (existing.pid === owner.pid) return true;
    if (!isAlive(existing.pid)) return true;
    if (now - existing.acquired_at > staleMs) return true;
    return false;
}

export function registryLockPath(serversDir: string): string {
    return `${serversDir}/_instance.lock.json`;
}

export interface WriteServersBatchDeps {
    workspaces: string[];
    info: { port: number; pid: number; version: string; started_at: number };
    projectHash: (workspacePath: string) => string;
    readLock: () => RegistryLock | null;
    writeLock: (lock: RegistryLock) => void;
    writeServer: (hash: string, data: {
        port: number;
        pid: number;
        projectPath: string;
        version: string;
        started_at: number;
    }) => void;
    isAlive: (pid: number) => boolean;
    now?: number;
}

export function writeServersBatch(deps: WriteServersBatchDeps): {
    ok: boolean;
    reason?: string;
    hashes: string[];
} {
    const now = deps.now ?? Date.now();
    const lock: RegistryLock = {
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
    const hashes: string[] = [];
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

export function releaseRegistryLockIfOwner(
    existing: RegistryLock | null,
    pid: number,
): boolean {
    return !!(existing && existing.pid === pid);
}
