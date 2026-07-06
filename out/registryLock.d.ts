export interface RegistryLock {
    pid: number;
    port: number;
    acquired_at: number;
    workspaces: string[];
}
/** Whether this hub instance may write registry files for the given workspaces. */
export declare function canAcquireRegistryLock(existing: RegistryLock | null, owner: RegistryLock, isAlive: (pid: number) => boolean, now: number, staleMs?: number): boolean;
export declare function registryLockPath(serversDir: string, hash?: string): string;
export declare function staleWorkspaceHashes(previousWorkspaces: string[], nextWorkspaces: string[], projectHash: (workspacePath: string) => string): string[];
export interface WriteServersBatchDeps {
    workspaces: string[];
    info: {
        port: number;
        pid: number;
        version: string;
        started_at: number;
    };
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
export declare function writeServersBatch(deps: WriteServersBatchDeps): {
    ok: boolean;
    reason?: string;
    hashes: string[];
};
export declare function releaseRegistryLockIfOwner(existing: RegistryLock | null, pid: number): boolean;
