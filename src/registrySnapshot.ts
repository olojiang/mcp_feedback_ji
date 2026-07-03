import type { ServerInfo } from './types';

export interface RegistryEntry extends ServerInfo {
    hash: string;
    alive: boolean;
}

export type PidAliveCheck = (pid: number) => boolean;

export function enrichRegistryEntries(
    servers: Array<ServerInfo & { hash: string }>,
    isAlive: PidAliveCheck,
): RegistryEntry[] {
    return servers.map((s) => ({
        ...s,
        alive: isAlive(s.pid),
    }));
}

/** Warn when other live extension windows run a different build. */
export function versionSkewWarnings(
    entries: RegistryEntry[],
    localVersion: string,
    localPid: number,
): string[] {
    const warnings: string[] = [];
    for (const e of entries) {
        if (!e.alive || e.pid === localPid) continue;
        if (e.version !== localVersion) {
            const ws = e.projectPath.split(/[/\\]/).pop() || e.projectPath;
            warnings.push(`${ws} pid=${e.pid} runs ${e.version} (this window: ${localVersion})`);
        }
    }
    return warnings;
}

export function formatRegistryTable(entries: RegistryEntry[]): string[] {
    return entries.map((e) => {
        const ws = e.projectPath.split(/[/\\]/).pop() || e.projectPath;
        const status = e.alive ? 'live' : 'stale';
        return `${status} | ${ws} | :${e.port} pid=${e.pid} | ${e.version}`;
    });
}
