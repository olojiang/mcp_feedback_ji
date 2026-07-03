/**
 * Centralized file I/O for all persistent state.
 * All paths under ~/.config/mcp-feedback-enhanced/ (or MCP_FEEDBACK_CONFIG_DIR).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
    ProjectState,
    ServerInfo,
} from './types';
import type { RegistryLock } from './registryLock';
import {
    getAgentContextPath,
    getConfigDir,
    getProjectsDir,
    getServersDir,
} from './configPaths';

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function safeReadJSON<T>(filePath: string): T | null {
    try {
        if (!fs.existsSync(filePath)) { return null; }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        return null;
    }
}

function safeWriteJSON(filePath: string, data: unknown): void {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function safeDelete(filePath: string): boolean {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
    } catch { /* ignore */ }
    return false;
}

function listJSONFiles(dir: string): string[] {
    try {
        if (!fs.existsSync(dir)) { return []; }
        return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
        return [];
    }
}

export function projectHash(workspacePath: string): string {
    const normalized = path.normalize(workspacePath).replace(/\/+$/, '');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function readProject(hash: string): ProjectState | null {
    return safeReadJSON<ProjectState>(path.join(getProjectsDir(), `${hash}.json`));
}

export function writeProject(hash: string, data: ProjectState): void {
    safeWriteJSON(path.join(getProjectsDir(), `${hash}.json`), data);
}

export function readServerByHash(hash: string): ServerInfo | null {
    return safeReadJSON<ServerInfo>(path.join(getServersDir(), `${hash}.json`));
}

export function writeServer(hash: string, data: ServerInfo): void {
    safeWriteJSON(path.join(getServersDir(), `${hash}.json`), data);
}

export function readRegistryLock(): RegistryLock | null {
    return safeReadJSON<RegistryLock>(path.join(getServersDir(), '_instance.lock.json'));
}

export function writeRegistryLock(lock: RegistryLock): void {
    safeWriteJSON(path.join(getServersDir(), '_instance.lock.json'), lock);
}

export function clearRegistryLock(): void {
    safeDelete(path.join(getServersDir(), '_instance.lock.json'));
}

export function deleteServerByHash(hash: string): boolean {
    return safeDelete(path.join(getServersDir(), `${hash}.json`));
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export function cleanupStaleServers(): number {
    let cleaned = 0;
    for (const f of listJSONFiles(getServersDir())) {
        const filePath = path.join(getServersDir(), f);
        const info = safeReadJSON<ServerInfo>(filePath);
        if (info && !isProcessAlive(info.pid)) {
            safeDelete(filePath);
            cleaned++;
        }
    }
    return cleaned;
}

export interface AgentContextFile {
    traceId?: string;
    workspaceRoots: string[];
    updatedAt: number;
}

export function writeAgentContext(workspaceRoots: string[], traceId = ''): void {
    const roots = workspaceRoots.map((r) => r.replace(/\/+$/, '')).filter(Boolean);
    if (!roots.length) return;
    safeWriteJSON(getAgentContextPath(), {
        traceId,
        workspaceRoots: roots,
        updatedAt: Date.now(),
    } satisfies AgentContextFile);
}

export function readAgentContext(): AgentContextFile | null {
    return safeReadJSON<AgentContextFile>(getAgentContextPath());
}

export function listAllServers(): Array<ServerInfo & { hash: string }> {
    const out: Array<ServerInfo & { hash: string }> = [];
    for (const f of listJSONFiles(getServersDir())) {
        const hash = f.replace(/\.json$/, '');
        const info = readServerByHash(hash);
        if (info) out.push({ ...info, hash });
    }
    return out.sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
}

export function isTestRegistryEntry(info: Pick<ServerInfo, 'projectPath' | 'version'>): boolean {
    const version = String(info.version || '');
    if (!/^\d+\.\d+\.\d+(-ji\.\d+)?$/.test(version)) return true;
    const p = String(info.projectPath || '');
    if (p.startsWith('/tmp/') || p.includes('/var/folders/')) return true;
    return false;
}

export function findTestRegistryEntries(): Array<ServerInfo & { hash: string }> {
    return listAllServers().filter((s) => isTestRegistryEntry(s));
}


export interface PruneTestRegistryResult {
    removed: string[];
    skippedAlive: Array<{ hash: string; pid: number; version: string; projectPath: string }>;
}

export function pruneTestRegistryEntries(isAlive: (pid: number) => boolean): PruneTestRegistryResult {
    const removed: string[] = [];
    const skippedAlive: PruneTestRegistryResult['skippedAlive'] = [];
    for (const entry of listAllServers()) {
        if (!isTestRegistryEntry(entry)) continue;
        if (isAlive(entry.pid)) {
            skippedAlive.push({
                hash: entry.hash,
                pid: entry.pid,
                version: entry.version,
                projectPath: entry.projectPath,
            });
            continue;
        }
        if (deleteServerByHash(entry.hash)) removed.push(entry.hash);
    }
    return { removed, skippedAlive };
}

export {
    getConfigDir as CONFIG_DIR,
    getProjectsDir as PROJECTS_DIR,
    getServersDir as SERVERS_DIR,
};
