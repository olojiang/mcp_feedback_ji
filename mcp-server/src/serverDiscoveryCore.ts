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

export function normalizeProjectPath(dir: string): string {
    return path.normalize(dir).replace(/\/+$/, '');
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

export function projectPathMatches(
    entryPath: string | undefined,
    want: string | undefined
): boolean {
    if (!want) return true;
    if (!entryPath) return false;
    return normalizeProjectPath(entryPath) === normalizeProjectPath(want);
}

export function pickServerForProject(
    candidates: ServerData[],
    projectDirectory?: string
): ServerData | null {
    if (!candidates.length) return null;
    if (!projectDirectory) {
        return candidates.length === 1 ? candidates[0] : null;
    }

    const want = normalizeProjectPath(projectDirectory);
    const matched = candidates.filter((c) => projectPathMatches(c.projectPath, want));
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) {
        return matched.sort((a, b) => (b.started_at || 0) - (a.started_at || 0))[0];
    }
    return null;
}

export function resolveWsUrl(currentUrl: string, serverPort: number): string {
    if (!serverPort) return currentUrl;
    const match = currentUrl.match(/^(ws:\/\/127\.0\.0\.1:)(\d+)(.*)$/);
    if (!match) return `ws://127.0.0.1:${serverPort}`;
    const currentPort = parseInt(match[2], 10);
    if (currentPort === serverPort) return currentUrl;
    return `${match[1]}${serverPort}${match[3] || ''}`;
}
