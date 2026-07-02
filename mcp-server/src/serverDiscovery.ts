import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import {
    type ServerData,
    type HealthData,
    isCurrentRegistryEntry,
    isProcessAlive,
    normalizeProjectPath,
    pickServerForProject,
    projectPathMatches,
} from './serverDiscoveryCore.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced');
const SERVERS_DIR = path.join(CONFIG_DIR, 'servers');

export type { ServerData, HealthData };
export {
    normalizeProjectPath,
    isProcessAlive,
    pickServerForProject,
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
        return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
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
    if (want) {
        log(`feedback_request start project=${want} trace=${process.env.CURSOR_TRACE_ID || ''}`);
    }

    const candidates: ServerData[] = [];

    for (const f of listJSONFiles(SERVERS_DIR)) {
        const filePath = path.join(SERVERS_DIR, f);
        const entry = readJSON<ServerData>(filePath);
        if (!entry?.port) continue;

        if (!isProcessAlive(entry.pid)) {
            log(`discover: skip port=${entry.port} source=${f} reason=dead_pid pid=${entry.pid}`);
            deleteRegistryFile(filePath);
            continue;
        }

        const health = await fetchHealth(entry.port);
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
            log(`discover: skip port=${entry.port} source=${f} reason=project_mismatch have=${entry.projectPath} want=${want}`);
            continue;
        }

        candidates.push(entry);
        log(`discover: accept port=${entry.port} pid=${entry.pid} source=${f}`);
    }

    const picked = pickServerForProject(candidates, projectDirectory);
    if (picked) {
        log(
            `feedback_request candidates=${picked.port}:${picked.pid}`
            + `(${projectDirectory ? projectHash(projectDirectory) + '.json' : 'auto'})`
        );
    } else if (want) {
        log(`feedback_request candidates=none want=${want}`);
    }
    return picked;
}
