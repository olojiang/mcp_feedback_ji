/**
 * Centralized file I/O for all persistent state.
 * All paths under ~/.config/mcp-feedback-enhanced/
 *
 * Directory structure:
 *   projects/<hash>.json   - Chat history per project
 *   servers/<hash>.json    - Extension instance registry (keyed by project hash)
 *   logs/
 *
 * Note: Pending messages are stored in-memory and served via HTTP.
 */
import type { ProjectState, ServerInfo } from './types';
declare const CONFIG_DIR: string;
declare const PROJECTS_DIR: string;
declare const SERVERS_DIR: string;
export declare function projectHash(workspacePath: string): string;
export declare function readProject(hash: string): ProjectState | null;
export declare function writeProject(hash: string, data: ProjectState): void;
export declare function readServerByHash(hash: string): ServerInfo | null;
export declare function writeServer(hash: string, data: ServerInfo): void;
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
export { CONFIG_DIR, PROJECTS_DIR, SERVERS_DIR };
