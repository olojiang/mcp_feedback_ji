/**
 * Centralized file I/O for all persistent state.
 * All paths under ~/.config/mcp-feedback-enhanced/ (or MCP_FEEDBACK_CONFIG_DIR).
 */
import type { ProjectState, ServerInfo } from './types';
import type { RegistryLock } from './registryLock';
import { getConfigDir, getProjectsDir, getServersDir } from './configPaths';
export declare function projectHash(workspacePath: string): string;
export declare function readProject(hash: string): ProjectState | null;
export declare function writeProject(hash: string, data: ProjectState): void;
export declare function readServerByHash(hash: string): ServerInfo | null;
export declare function writeServer(hash: string, data: ServerInfo): void;
export declare function readRegistryLock(): RegistryLock | null;
export declare function writeRegistryLock(lock: RegistryLock): void;
export declare function clearRegistryLock(): void;
export declare function deleteServerByHash(hash: string): boolean;
export declare function cleanupStaleServers(): number;
export interface AgentContextFile {
    traceId?: string;
    workspaceRoots: string[];
    updatedAt: number;
}
export declare function writeAgentContext(workspaceRoots: string[], traceId?: string): void;
export declare function readAgentContext(): AgentContextFile | null;
export declare function listAllServers(): Array<ServerInfo & {
    hash: string;
}>;
export declare function isTestRegistryEntry(info: Pick<ServerInfo, 'projectPath' | 'version'>): boolean;
export declare function findTestRegistryEntries(): Array<ServerInfo & {
    hash: string;
}>;
export interface PruneTestRegistryResult {
    removed: string[];
    skippedAlive: Array<{
        hash: string;
        pid: number;
        version: string;
        projectPath: string;
    }>;
}
export declare function pruneTestRegistryEntries(isAlive: (pid: number) => boolean): PruneTestRegistryResult;
export { getConfigDir as CONFIG_DIR, getProjectsDir as PROJECTS_DIR, getServersDir as SERVERS_DIR, };
