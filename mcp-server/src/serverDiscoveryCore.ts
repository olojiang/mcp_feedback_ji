import * as path from 'node:path';

export interface ServerData {
    port: number;
    pid: number;
    projectPath: string;
    version: string;
    started_at?: number;
}

export interface HealthData {
    ok: boolean;
    port: number;
    pid: number;
    version?: string;
}

export function isCurrentRegistryEntry(entry: ServerData, health: HealthData): boolean {
    return health.ok === true
        && entry.port === health.port
        && entry.pid === health.pid;
}

export function normalizeProjectPath(dir: string): string {
    const normalized = path.normalize(dir);
    const root = path.parse(normalized).root;
    if (normalized === root) return root;
    const stripped = normalized.replace(/[\\/]+$/, '');
    return stripped || root || normalized;
}

export function isProcessAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export type ProjectPathRelation = 'exact' | 'ancestor' | 'descendant' | 'none';

export function projectPathRelation(
    entryPath: string | undefined,
    want: string | undefined
): ProjectPathRelation {
    if (!want) return 'exact';
    if (!entryPath) return 'none';
    const entry = normalizeProjectPath(entryPath);
    const target = normalizeProjectPath(want);
    if (entry === target) return 'exact';
    if (target.startsWith(entry + path.sep)) return 'ancestor';
    if (entry.startsWith(target + path.sep)) return 'descendant';
    return 'none';
}

export function projectPathMatches(
    entryPath: string | undefined,
    want: string | undefined
): boolean {
    return projectPathRelation(entryPath, want) !== 'none';
}

function relationScore(relation: ProjectPathRelation): number {
    switch (relation) {
        case 'exact': return 3;
        case 'descendant': return 2;
        case 'ancestor': return 1;
        default: return 0;
    }
}

function pickSingleServerIdentity(candidates: ServerData[]): ServerData | null {
    const identities = new Set(candidates.map((server) => `${server.port}:${server.pid}`));
    if (identities.size !== 1) return null;
    return [...candidates].sort((a, b) => (b.started_at || 0) - (a.started_at || 0))[0];
}

export function pickServerForProject(
    candidates: ServerData[],
    projectDirectory?: string
): ServerData | null {
    if (!candidates.length) return null;
    if (!projectDirectory) {
        return candidates.length === 1 ? candidates[0] : pickSingleServerIdentity(candidates);
    }

    const want = normalizeProjectPath(projectDirectory);
    const scored = candidates
        .map((server) => ({
            server,
            relation: projectPathRelation(server.projectPath, want),
        }))
        .filter((item) => item.relation !== 'none');

    if (!scored.length) return null;
    if (scored.length === 1) return scored[0].server;

    scored.sort((a, b) => {
        const scoreDiff = relationScore(b.relation) - relationScore(a.relation);
        if (scoreDiff !== 0) return scoreDiff;
        const lenDiff = normalizeProjectPath(b.server.projectPath).length
            - normalizeProjectPath(a.server.projectPath).length;
        if (lenDiff !== 0) return lenDiff;
        return (b.server.started_at || 0) - (a.server.started_at || 0);
    });
    return scored[0].server;
}

export function pickServerForImplicitProject(
    candidates: ServerData[],
    implicitProjectDirectory?: string,
): ServerData | null {
    if (!implicitProjectDirectory) return null;
    const implicit = normalizeProjectPath(implicitProjectDirectory);
    const inWorkspace = candidates.filter((server) => {
        const relation = projectPathRelation(server.projectPath, implicit);
        return relation === 'exact' || relation === 'ancestor';
    });
    return pickServerForProject(inWorkspace, implicit);
}

export function resolveWsUrl(currentUrl: string, serverPort: number): string {
    if (!serverPort) return currentUrl;
    const match = currentUrl.match(/^(ws:\/\/127\.0\.0\.1:)(\d+)(.*)$/);
    if (!match) return `ws://127.0.0.1:${serverPort}`;
    const currentPort = parseInt(match[2], 10);
    if (currentPort === serverPort) return currentUrl;
    return `${match[1]}${serverPort}${match[3] || ''}`;
}
