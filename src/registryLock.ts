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

export function registryLockPath(serversDir: string, hash?: string): string {
    return hash ? `${serversDir}/_instance.${hash}.lock.json` : `${serversDir}/_instance.lock.json`;
}

export function staleWorkspaceHashes(
    previousWorkspaces: string[],
    nextWorkspaces: string[],
    projectHash: (workspacePath: string) => string,
): string[] {
    const next = new Set(nextWorkspaces.map((workspace) => projectHash(workspace)));
    return previousWorkspaces
        .map((workspace) => projectHash(workspace))
        .filter((hash) => !next.has(hash));
}

export interface WriteServersBatchDeps {
    workspaces: string[];
    info: { port: number; pid: number; version: string; started_at: number };
    projectHash: (workspacePath: string) => string;
    readLock: (hash: string) => RegistryLock | null;
    writeLock: (hash: string, lock: RegistryLock) => void;
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
    const entries = deps.workspaces.map((workspace) => ({
        workspace,
        hash: deps.projectHash(workspace),
    }));
    for (const entry of entries) {
        const lock: RegistryLock = {
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
    const hashes: string[] = [];
    for (const entry of entries) {
        const lock: RegistryLock = {
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

export function releaseRegistryLockIfOwner(
    existing: RegistryLock | null,
    pid: number,
): boolean {
    return !!(existing && existing.pid === pid);
}
