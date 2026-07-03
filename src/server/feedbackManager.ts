/**
 * FIFO queue of pending feedback requests.
 *
 * On MCP disconnect, sessions stay alive so the panel can respond.
 * On reconnect for the same project (dead MCP ws), transport is swapped via updateTransport().
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
}

export type TransportUpdateResult = {
    updated: boolean;
    sessionId?: string;
    skipReason?: 'no_project' | 'no_pending' | 'live_mcp_still_open';
    blockedSessionId?: string;
};

export type TraceReuseResult = {
    action: 'none' | 'reuse' | 'steal';
    sessionId?: string;
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
    projectDir?: string;
    traceId?: string;
    summary: string;
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
                sessionId, mcpClient, projectDir, traceId, summary, resolve, reject,
            });
        });
        this.promises.set(sessionId, promise);
        return { sessionId, promise };
    }

    resolveFirst(result: FeedbackResult): boolean {
        const entry = this.queue.shift();
        if (!entry) return false;
        this.promises.delete(entry.sessionId);
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }

    resolveBySessionId(sessionId: string, result: FeedbackResult): boolean {
        const idx = this.queue.findIndex((entry) => entry.sessionId === sessionId);
        if (idx < 0) return false;
        const entry = this.queue.splice(idx, 1)[0];
        this.promises.delete(sessionId);
        entry.resolve({ ...result, transport: entry.mcpClient });
        return true;
    }

    updateTransport(
        newWs: WebSocket,
        projectDir?: string,
        summary?: string,
    ): TransportUpdateResult {
        if (!projectDir) return { updated: false, skipReason: 'no_project' };
        let blockedSessionId: string | undefined;
        for (const entry of this.queue) {
            if (entry.projectDir !== projectDir) continue;
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

    /** Same agent trace reconnecting or duplicate MCP call — reuse tab instead of new session. */
    reuseByTraceId(
        mcpWs: WebSocket,
        traceId: string | undefined,
        summary?: string,
    ): TraceReuseResult {
        if (!traceId) return { action: 'none' };
        for (const entry of this.queue) {
            if (entry.traceId !== traceId) continue;
            if (!isMcpTransportOpen(entry.mcpClient)) {
                entry.mcpClient = mcpWs;
                entry.mcpDetached = false;
                if (summary) entry.summary = summary;
                return { action: 'reuse', sessionId: entry.sessionId };
            }
            if (entry.mcpClient !== mcpWs) {
                entry.mcpClient = mcpWs;
                entry.mcpDetached = false;
                if (summary) entry.summary = summary;
                return { action: 'steal', sessionId: entry.sessionId };
            }
            return { action: 'none', sessionId: entry.sessionId };
        }
        return { action: 'none' };
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

    promiseForSession(sessionId: string): Promise<ResolvedFeedback> | null {
        return this.promises.get(sessionId) ?? null;
    }

    detachMcpClient(ws: WebSocket): string[] {
        const detached: string[] = [];
        for (const entry of this.queue) {
            if (entry.mcpClient === ws) {
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

    tryAttachHandlers(sessionId: string): boolean {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        if (!entry || entry.handlersAttached) return false;
        entry.handlersAttached = true;
        return true;
    }

    rejectAll(error: Error): void {
        for (const entry of this.queue) {
            this.promises.delete(entry.sessionId);
            entry.reject(error);
        }
        this.queue = [];
        this.promises.clear();
    }
}
