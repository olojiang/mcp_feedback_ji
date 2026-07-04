import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getAgentContextPath, getServersDir } from './configPaths.js';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import {
    type ServerData,
    type HealthData,
    isCurrentRegistryEntry,
    isProcessAlive,
    normalizeProjectPath,
    pickServerForImplicitProject,
    pickServerForProject,
    projectPathMatches,
    resolveImplicitProjectDirectory,
    type AgentContextSnapshot,
} from './serverDiscoveryCore.js';

export type { ServerData, HealthData };
export {
    normalizeProjectPath,
    isProcessAlive,
    pickServerForProject,
    pickServerForImplicitProject,
    resolveWsUrl,
} from './serverDiscoveryCore.js';

function readJSON<T>(filePath: string): T | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        return null;
    }
}

function listJSONFiles(dir: string): string[] {
    try {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
    } catch {
        return [];
    }
}

function deleteRegistryFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* ignore */ }
}

function projectHash(dir: string): string {
    const normalized = normalizeProjectPath(dir);
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function currentMcpVersion(): string {
    return process.env.MCP_FEEDBACK_VERSION || 'unknown';
}

function implicitProjectDirectory(agentContext?: AgentContextSnapshot | null): string | undefined {
    let cwd: string | undefined;
    try {
        cwd = process.cwd();
    } catch {
        cwd = undefined;
    }

    return resolveImplicitProjectDirectory({
        envProjectDirectory: process.env.MCP_FEEDBACK_PROJECT_DIRECTORY,
        cwd,
        agentContext,
        traceId: process.env.CURSOR_TRACE_ID || '',
    });
}

export function readAgentContext(): AgentContextSnapshot | null {
    try {
        if (!fs.existsSync(getAgentContextPath())) return null;
        return JSON.parse(fs.readFileSync(getAgentContextPath(), 'utf-8')) as AgentContextSnapshot;
    } catch {
        return null;
    }
}

export async function fetchHealth(port: number): Promise<HealthData | null> {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1500 }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body) as HealthData;
                    resolve(data?.ok ? data : null);
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

export async function findExtensionServer(
    projectDirectory?: string,
    log: (msg: string) => void = () => {}
): Promise<ServerData | null> {
    const want = projectDirectory ? normalizeProjectPath(projectDirectory) : undefined;
    const agentContext = want ? null : readAgentContext();
    log(
        `feedback_request start version=${currentMcpVersion()} `
        + `project=${want ?? '(none)'} trace=${process.env.CURSOR_TRACE_ID || ''}`
    );

    const candidates: ServerData[] = [];
    const skippedMismatch: string[] = [];

    const aliveEntries: { f: string; entry: ServerData }[] = [];
    for (const f of listJSONFiles(getServersDir())) {
        const filePath = path.join(getServersDir(), f);
        const entry = readJSON<ServerData>(filePath);
        if (!entry?.port) continue;

        if (!isProcessAlive(entry.pid)) {
            log(`discover: skip port=${entry.port} source=${f} reason=dead_pid pid=${entry.pid}`);
            deleteRegistryFile(filePath);
            continue;
        }
        aliveEntries.push({ f, entry });
    }

    const healthResults = await Promise.all(
        aliveEntries.map(async ({ f, entry }) => {
            const health = await fetchHealth(entry.port);
            return { f, entry, health };
        })
    );

    for (const { f, entry, health } of healthResults) {
        const filePath = path.join(getServersDir(), f);
        if (!health) {
            log(`discover: skip port=${entry.port} source=${f} reason=health_fail`);
            continue;
        }

        if (!isCurrentRegistryEntry(entry, health)) {
            log(
                `discover: stale registry port=${entry.port} reg_pid=${entry.pid} `
                + `health_pid=${health.pid} source=${f}`
            );
            deleteRegistryFile(filePath);
            continue;
        }

        if (want && !projectPathMatches(entry.projectPath, want)) {
            skippedMismatch.push(`${entry.port}:${f}`);
            continue;
        }

        candidates.push(entry);
        log(`discover: accept port=${entry.port} pid=${entry.pid} source=${f}`);
    }

    if (!candidates.length && skippedMismatch.length) {
        log(`discover: skipped ${skippedMismatch.length} project_mismatch: ${skippedMismatch.join(', ')}`);
    }

    // When project_directory is omitted, resolve implicit workspace *before* auto-picking
    // a lone hub. Otherwise a single wrong-project hub (e.g. spatial-smart-apps) wins
    // while the correct window's hub is restarting — MCP waits on the wrong port.
    const implicit = !want ? implicitProjectDirectory(agentContext) : undefined;
    let pickedFromImplicitProject: string | undefined;
    let picked = pickServerForProject(candidates, want ?? implicit);
    if (picked && implicit && !want) {
        pickedFromImplicitProject = normalizeProjectPath(implicit);
        const source = agentContext?.workspaceRoots?.includes(implicit)
            ? 'agent_context'
            : 'cwd';
        log(`feedback_request implicit_project=${pickedFromImplicitProject} source=${source}`);
    }

    if (picked) {
        log(
            `feedback_request candidates=${picked.port}:${picked.pid}`
            + `(${projectDirectory
                ? projectHash(projectDirectory) + '.json'
                : pickedFromImplicitProject
                    ? `cwd:${projectHash(pickedFromImplicitProject)}.json`
                    : 'auto'
            })`
        );
    } else if (want) {
        log(`feedback_request candidates=none want=${want}`);
    } else {
        log('feedback_request candidates=none reason=ambiguous_no_project');
    }
    return picked;
}
