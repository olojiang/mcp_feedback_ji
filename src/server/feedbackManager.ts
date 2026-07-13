/**
 * FIFO queue of pending feedback requests.
 *
 * On MCP disconnect, sessions stay alive so the panel can respond.
 * On reconnect for the same trace/project (dead MCP ws), transport is swapped via updateTransport().
 * A live MCP connection for the same project always creates a new session tab.
 * resolve returns the *current* transport (not the one captured at enqueue time).
 */

import { WebSocket } from 'ws';

export interface FeedbackResult {
    feedback: string;
    images?: string[];
}

export interface ResolvedFeedback extends FeedbackResult {
    transport: WebSocket;
    transports?: WebSocket[];
    projectDir?: string;
    traceId?: string;
    enqueuedAt?: number;
    mcpDetached?: boolean;
}

export type TransportUpdateResult = {
    updated: boolean;
    sessionId?: string;
    skipReason?: 'no_project' | 'no_pending' | 'live_mcp_still_open';
    blockedSessionId?: string;
};

export type TraceReuseResult = {
    action: 'none' | 'reuse' | 'steal' | 'duplicate';
    sessionId?: string;
    enqueuedAt?: number;
    /** Closed prior MCP WebSocket replaced by reuse. Live steals keep old WS subscribed. */
    supersededWs?: WebSocket;
};

export type TransportDuplicateResult = {
    duplicate: boolean;
    sessionId?: string;
    enqueuedAt?: number;
};

export interface PendingSessionSnapshot {
    id: string;
    label: string;
    summary: string;
    projectDir?: string;
    traceId?: string;
    waiting: true;
    mcp_detached?: boolean;
}

interface PendingFeedback {
    sessionId: string;
    mcpClient: WebSocket;
    subscriberClients?: Set<WebSocket>;
    projectDir?: string;
    traceId?: string;
    summary: string;
    enqueuedAt: number;
    mcpDetached?: boolean;
    handlersAttached?: boolean;
    resolve: (result: ResolvedFeedback) => void;
    reject: (error: Error) => void;
}

function newSessionId(): string {
    return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isMcpTransportOpen(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING;
}

export class FeedbackManager {
    private queue: PendingFeedback[] = [];
    private readonly promises = new Map<string, Promise<ResolvedFeedback>>();

    enqueue(
        mcpClient: WebSocket,
        projectDir?: string,
        summary = '',
        traceId?: string,
    ): { sessionId: string; promise: Promise<ResolvedFeedback> } {
        const sessionId = newSessionId();
        const promise = new Promise<ResolvedFeedback>((resolve, reject) => {
            this.queue.push({
                sessionId, mcpClient, projectDir, traceId, summary,
                enqueuedAt: Date.now(),
                resolve, reject,
            });
        });
        this.promises.set(sessionId, promise);
        return { sessionId, promise };
    }

    resolveFirst(result: FeedbackResult): boolean {
        const entry = this.queue.shift();
        if (!entry) return false;
        this.promises.delete(entry.sessionId);
        entry.resolve(this._resolvedFeedback(entry, result));
        return true;
    }

    resolveBySessionId(sessionId: string, result: FeedbackResult): boolean {
        const idx = this.queue.findIndex((entry) => entry.sessionId === sessionId);
        if (idx < 0) return false;
        const entry = this.queue.splice(idx, 1)[0];
        this.promises.delete(sessionId);
        entry.resolve(this._resolvedFeedback(entry, result));
        return true;
    }

    updateTransport(
        newWs: WebSocket,
        projectDir?: string,
        summary?: string,
        traceId?: string,
    ): TransportUpdateResult {
        const matchProject = projectDir || undefined;
        if (!matchProject) return { updated: false, skipReason: 'no_project' };
        let blockedSessionId: string | undefined;
        for (const entry of this.queue) {
            if (entry.projectDir !== matchProject) continue;
            if (!this._traceCompatible(entry.traceId, traceId)) continue;
            if (!isMcpTransportOpen(entry.mcpClient)) {
                entry.mcpClient = newWs;
                entry.mcpDetached = false;
                if (summary) entry.summary = summary;
                return { updated: true, sessionId: entry.sessionId };
            }
            blockedSessionId = entry.sessionId;
        }
        if (blockedSessionId) {
            return { updated: false, skipReason: 'live_mcp_still_open', blockedSessionId };
        }
        return { updated: false, skipReason: 'no_pending' };
    }

    /** Reattach detached pending sessions when MCP WS reconnects to hub. */
    reattachDetachedForHub(newWs: WebSocket, hubWorkspaces: string[], traceId?: string): string[] {
        if (!traceId) return [];
        const soleWorkspace = hubWorkspaces.length === 1 ? hubWorkspaces[0] : undefined;
        const candidates: PendingFeedback[] = [];
        for (const entry of this.queue) {
            if (!entry.mcpDetached) continue;
            if (entry.traceId !== traceId) continue;
            const projectMatch = entry.projectDir
                ? hubWorkspaces.includes(entry.projectDir)
                : soleWorkspace !== undefined;
            if (!projectMatch) continue;
            candidates.push(entry);
        }
        if (candidates.length !== 1) {
            return [];
        }
        const entry = candidates[0];
        entry.mcpClient = newWs;
        entry.mcpDetached = false;
        if (!entry.projectDir && soleWorkspace) {
            entry.projectDir = soleWorkspace;
        }
        return [entry.sessionId];
    }

    /** Same agent trace reconnecting or duplicate MCP call — reuse tab instead of new session. */
    reuseByTraceId(
        mcpWs: WebSocket,
        traceId: string | undefined,
        summary?: string,
    ): TraceReuseResult {
        if (!traceId) return { action: 'none' };
        for (const entry of this.queue) {
            if (entry.traceId !== traceId) continue;
            if (entry.mcpClient === mcpWs) {
                return {
                    action: 'duplicate',
                    sessionId: entry.sessionId,
                    enqueuedAt: entry.enqueuedAt,
                };
            }
            const supersededWs = entry.mcpClient;
            if (!isMcpTransportOpen(supersededWs)) {
                entry.mcpClient = mcpWs;
                entry.mcpDetached = false;
                if (summary) entry.summary = summary;
                return {
                    action: 'reuse',
                    sessionId: entry.sessionId,
                    supersededWs: supersededWs !== mcpWs ? supersededWs : undefined,
                };
            }
            entry.mcpClient = mcpWs;
            entry.mcpDetached = false;
            this._addSubscriber(entry, supersededWs);
            if (summary) entry.summary = summary;
            return { action: 'steal', sessionId: entry.sessionId };
        }
        return { action: 'none' };
    }

    duplicateByTransport(mcpWs: WebSocket): TransportDuplicateResult {
        for (const entry of this.queue) {
            if (entry.mcpDetached) continue;
            if (!isMcpTransportOpen(entry.mcpClient)) continue;
            if (entry.mcpClient === mcpWs) {
                return {
                    duplicate: true,
                    sessionId: entry.sessionId,
                    enqueuedAt: entry.enqueuedAt,
                };
            }
            if (entry.subscriberClients?.has(mcpWs)) {
                return {
                    duplicate: true,
                    sessionId: entry.sessionId,
                    enqueuedAt: entry.enqueuedAt,
                };
            }
        }
        return { duplicate: false };
    }

    explainNewSession(mcpWs: WebSocket, projectDir?: string): string {
        if (!projectDir) return 'no_project_directory';
        const sameProject = this.queue.filter((e) => e.projectDir === projectDir);
        if (sameProject.length === 0) return 'new_request';
        const liveOther = sameProject.filter(
            (e) => isMcpTransportOpen(e.mcpClient) && e.mcpClient !== mcpWs,
        );
        if (liveOther.length > 0) {
            return `parallel_live_mcp:${liveOther.map((e) => e.sessionId).join('|')}`;
        }
        return 'new_request';
    }

    hasPending(): boolean {
        return this.queue.length > 0;
    }

    pendingCount(): number {
        return this.queue.length;
    }

    pendingSessions(): PendingSessionSnapshot[] {
        return this.queue.map((entry) => ({
            id: entry.sessionId,
            label: entry.projectDir ?? entry.sessionId,
            summary: entry.summary,
            projectDir: entry.projectDir,
            ...(entry.traceId ? { traceId: entry.traceId } : {}),
            waiting: true,
            mcp_detached: entry.mcpDetached === true,
        }));
    }

    pendingSessionsForPersist(): Array<{
        id: string;
        summary: string;
        projectDir?: string;
        traceId?: string;
        mcpDetached: boolean;
        enqueuedAt: number;
    }> {
        return this.queue.map((entry) => ({
            id: entry.sessionId,
            summary: entry.summary,
            projectDir: entry.projectDir,
            traceId: entry.traceId,
            mcpDetached: entry.mcpDetached === true,
            enqueuedAt: entry.enqueuedAt,
        }));
    }

    promiseForSession(sessionId: string): Promise<ResolvedFeedback> | null {
        return this.promises.get(sessionId) ?? null;
    }

    restoreDetachedSession(snapshot: {
        sessionId: string;
        projectDir?: string;
        traceId?: string;
        summary: string;
        enqueuedAt?: number;
    }): boolean {
        if (this.queue.some((entry) => entry.sessionId === snapshot.sessionId)) {
            return false;
        }
        const closedWs = { readyState: 3 } as WebSocket;
        const promise = new Promise<ResolvedFeedback>((resolve, reject) => {
            this.queue.push({
                sessionId: snapshot.sessionId,
                mcpClient: closedWs,
                projectDir: snapshot.projectDir,
                traceId: snapshot.traceId,
                summary: snapshot.summary,
                enqueuedAt: snapshot.enqueuedAt ?? Date.now(),
                mcpDetached: true,
                resolve,
                reject,
            });
        });
        this.promises.set(snapshot.sessionId, promise);
        return true;
    }

    detachMcpClient(ws: WebSocket): string[] {
        const detached: string[] = [];
        for (const entry of this.queue) {
            if (entry.subscriberClients?.delete(ws)) {
                continue;
            }
            if (entry.mcpClient === ws) {
                const replacement = this._firstOpenSubscriber(entry);
                if (replacement) {
                    entry.subscriberClients?.delete(replacement);
                    entry.mcpClient = replacement;
                    entry.mcpDetached = false;
                    continue;
                }
                entry.mcpDetached = true;
                detached.push(entry.sessionId);
            }
        }
        return detached;
    }

    isMcpDetached(sessionId: string): boolean {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        return entry?.mcpDetached === true;
    }

    waitMetaForSession(sessionId: string): {
        enqueuedAt?: number;
        mcpDetached: boolean;
        wsReadyState?: number;
        traceId?: string;
    } | undefined {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        if (!entry) return undefined;
        return {
            enqueuedAt: entry.enqueuedAt,
            mcpDetached: entry.mcpDetached === true,
            wsReadyState: entry.mcpClient.readyState,
            traceId: entry.traceId,
        };
    }

    mcpTransportForSession(sessionId: string): WebSocket | undefined {
        return this.queue.find((item) => item.sessionId === sessionId)?.mcpClient;
    }

    /** Live MCP wait for hooks — blocks duplicate interactive_feedback on same trace. */
    liveWaitForTrace(traceId: string | undefined): { sessionId: string; detached: boolean } | null {
        if (!traceId) return null;
        for (const entry of this.queue) {
            if (entry.traceId !== traceId) continue;
            if (entry.mcpDetached) continue;
            if (!this._hasOpenTransport(entry)) continue;
            return { sessionId: entry.sessionId, detached: false };
        }
        return null;
    }

    /** MCP transports with live (non-detached) pending sessions — protected from normal stale sweep. */
    activeMcpClients(): WebSocket[] {
        const seen = new Set<WebSocket>();
        const out: WebSocket[] = [];
        for (const entry of this.queue) {
            if (entry.mcpDetached) continue;
            for (const ws of this._transportsFor(entry)) {
                if (!isMcpTransportOpen(ws)) continue;
                if (seen.has(ws)) continue;
                seen.add(ws);
                out.push(ws);
            }
        }
        return out;
    }

    tryAttachHandlers(sessionId: string): boolean {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        if (!entry || entry.handlersAttached) return false;
        entry.handlersAttached = true;
        return true;
    }

    rejectAll(error: Error): void {
        for (const entry of this.queue) {
            this.promises.delete(entry.sessionId);
            if (entry.mcpDetached) continue;
            entry.reject(error);
        }
        this.queue = [];
        this.promises.clear();
    }

    private _addSubscriber(entry: PendingFeedback, ws: WebSocket): void {
        if (entry.mcpClient === ws) return;
        if (!entry.subscriberClients) entry.subscriberClients = new Set<WebSocket>();
        entry.subscriberClients.add(ws);
    }

    private _transportsFor(entry: PendingFeedback): WebSocket[] {
        const out: WebSocket[] = [];
        const seen = new Set<WebSocket>();
        const add = (ws: WebSocket | undefined) => {
            if (!ws || seen.has(ws)) return;
            seen.add(ws);
            out.push(ws);
        };
        add(entry.mcpClient);
        for (const ws of entry.subscriberClients ?? []) add(ws);
        return out;
    }

    private _firstOpenSubscriber(entry: PendingFeedback): WebSocket | undefined {
        for (const ws of entry.subscriberClients ?? []) {
            if (isMcpTransportOpen(ws)) return ws;
        }
        return undefined;
    }

    private _hasOpenTransport(entry: PendingFeedback): boolean {
        return this._transportsFor(entry).some((ws) => isMcpTransportOpen(ws));
    }

    private _traceCompatible(existingTraceId?: string, nextTraceId?: string): boolean {
        if (!existingTraceId && !nextTraceId) return true;
        if (existingTraceId && nextTraceId) return existingTraceId === nextTraceId;
        return false;
    }

    private _resolvedFeedback(entry: PendingFeedback, result: FeedbackResult): ResolvedFeedback {
        return {
            ...result,
            transport: entry.mcpClient,
            transports: this._transportsFor(entry),
            projectDir: entry.projectDir,
            traceId: entry.traceId,
            enqueuedAt: entry.enqueuedAt,
            mcpDetached: entry.mcpDetached === true,
        };
    }
}
