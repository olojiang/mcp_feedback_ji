import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfigDir } from './configPaths.js';
import { projectHash } from './fileStore.js';

export interface PersistedPendingSession {
    id: string;
    summary: string;
    projectDir?: string;
    traceId?: string;
    mcpDetached?: boolean;
    enqueuedAt?: number;
}

export interface PersistedPendingSnapshot {
    workspaces: string[];
    savedAt: number;
    sessions: PersistedPendingSession[];
    pendingComments?: string[];
    pendingImages?: string[];
}

/** Drop persisted pending older than this (default 24h). */
export const PENDING_PERSIST_MAX_AGE_MS = readMaxAgeMs();

function readMaxAgeMs(): number {
    const n = Number(process.env.MCP_FEEDBACK_PENDING_MAX_AGE_MS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86_400_000;
}

export function isPersistedSessionExpired(
    session: PersistedPendingSession,
    now = Date.now(),
    maxAgeMs = PENDING_PERSIST_MAX_AGE_MS,
): boolean {
    const anchor = session.enqueuedAt ?? 0;
    if (!anchor) return false;
    return now - anchor > maxAgeMs;
}

export function pendingSessionsFilePath(workspaces: string[]): string {
    const hashes = workspaces.length
        ? workspaces.map((workspace) => projectHash(workspace)).sort()
        : [projectHash('_default')];
    return path.join(getConfigDir(), 'pending-sessions', `${hashes.join('-')}.json`);
}

function ensureParent(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writePersistedPendingSessions(
    workspaces: string[],
    sessions: PersistedPendingSession[],
    extras?: { pendingComments?: string[]; pendingImages?: string[] },
): void {
    if (!workspaces.length) return;
    const filePath = pendingSessionsFilePath(workspaces);
    if (!sessions.length && !(extras?.pendingComments?.length) && !(extras?.pendingImages?.length)) {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch { /* ignore */ }
        return;
    }
    const payload: PersistedPendingSnapshot = {
        workspaces: [...workspaces],
        savedAt: Date.now(),
        sessions,
        ...(extras?.pendingComments?.length ? { pendingComments: extras.pendingComments } : {}),
        ...(extras?.pendingImages?.length ? { pendingImages: extras.pendingImages } : {}),
    };
    ensureParent(filePath);
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, filePath);
}

export function readPersistedPendingSessions(
    workspaces: string[],
): PersistedPendingSnapshot | null {
    if (!workspaces.length) return null;
    const filePath = pendingSessionsFilePath(workspaces);
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PersistedPendingSnapshot;
        if (!raw?.sessions?.length) return null;
        const want = workspaces.map((w) => projectHash(w)).sort().join(',');
        const got = (raw.workspaces || []).map((w) => projectHash(w)).sort().join(',');
        if (want !== got) return null;
        return raw;
    } catch {
        return null;
    }
}

export function clearPersistedPendingSessions(workspaces: string[]): void {
    writePersistedPendingSessions(workspaces, []);
}
