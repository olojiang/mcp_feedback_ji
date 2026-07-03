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

/** Release builds use semver or ji patch tags only. */
export function isPublishableVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-ji\.\d+)?$/.test(String(version || ''));
}

export function isTestRegistryEntry(info: Pick<ServerInfo, 'projectPath' | 'version'>): boolean {
    if (!isPublishableVersion(info.version)) return true;
    const p = String(info.projectPath || '');
    return p.startsWith('/tmp/') || p.includes('/var/folders/');
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
        if (isTestRegistryEntry(e)) continue;
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
        const tag = isTestRegistryEntry(e) ? ' test' : '';
        return `${status}${tag} | ${ws} | :${e.port} pid=${e.pid} | ${e.version}`;
    });
}

export function buildDiagnoseBundle(payload: Record<string, unknown>): string {
    return JSON.stringify({
        generated_at: new Date().toISOString(),
        ...payload,
    }, null, 2);
}
