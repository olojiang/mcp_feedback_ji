import type { ServerInfo } from './types';
export interface RegistryEntry extends ServerInfo {
    hash: string;
    alive: boolean;
}
export type PidAliveCheck = (pid: number) => boolean;
export declare function enrichRegistryEntries(servers: Array<ServerInfo & {
    hash: string;
}>, isAlive: PidAliveCheck): RegistryEntry[];
/** Release builds use semver or ji patch tags only. */
export declare function isPublishableVersion(version: string): boolean;
export declare function isTestRegistryEntry(info: Pick<ServerInfo, 'projectPath' | 'version'>): boolean;
/** Warn when other live extension windows run a different build. */
export declare function versionSkewWarnings(entries: RegistryEntry[], localVersion: string, localPid: number): string[];
export declare function formatRegistryTable(entries: RegistryEntry[]): string[];
export declare function buildDiagnoseBundle(payload: Record<string, unknown>): string;
