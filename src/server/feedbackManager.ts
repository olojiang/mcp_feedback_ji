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

export interface PendingSessionSnapshot {
    id: string;
    label: string;
    summary: string;
    projectDir?: string;
    waiting: true;
}

interface PendingFeedback {
    sessionId: string;
    mcpClient: WebSocket;
    projectDir?: string;
    summary: string;
    mcpDetached?: boolean;
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
    ): { sessionId: string; promise: Promise<ResolvedFeedback> } {
        const sessionId = newSessionId();
        const promise = new Promise<ResolvedFeedback>((resolve, reject) => {
            this.queue.push({ sessionId, mcpClient, projectDir, summary, resolve, reject });
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
    ): { updated: boolean; sessionId?: string } {
        if (!projectDir) return { updated: false };
        for (const entry of this.queue) {
            if (entry.projectDir && entry.projectDir === projectDir && !isMcpTransportOpen(entry.mcpClient)) {
                entry.mcpClient = newWs;
                entry.mcpDetached = false;
                if (summary) entry.summary = summary;
                return { updated: true, sessionId: entry.sessionId };
            }
        }
        return { updated: false };
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
            waiting: true,
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

    rejectAll(error: Error): void {
        for (const entry of this.queue) {
            this.promises.delete(entry.sessionId);
            entry.reject(error);
        }
        this.queue = [];
        this.promises.clear();
    }
}
