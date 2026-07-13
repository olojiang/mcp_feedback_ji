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
export declare class FeedbackManager {
    private queue;
    private readonly promises;
    enqueue(mcpClient: WebSocket, projectDir?: string, summary?: string, traceId?: string): {
        sessionId: string;
        promise: Promise<ResolvedFeedback>;
    };
    resolveFirst(result: FeedbackResult): boolean;
    resolveBySessionId(sessionId: string, result: FeedbackResult): boolean;
    updateTransport(newWs: WebSocket, projectDir?: string, summary?: string, traceId?: string): TransportUpdateResult;
    /** Reattach detached pending sessions when MCP WS reconnects to hub. */
    reattachDetachedForHub(newWs: WebSocket, hubWorkspaces: string[], traceId?: string): string[];
    /** Same agent trace reconnecting or duplicate MCP call — reuse tab instead of new session. */
    reuseByTraceId(mcpWs: WebSocket, traceId: string | undefined, summary?: string): TraceReuseResult;
    duplicateByTransport(mcpWs: WebSocket): TransportDuplicateResult;
    explainNewSession(mcpWs: WebSocket, projectDir?: string): string;
    hasPending(): boolean;
    pendingCount(): number;
    pendingSessions(): PendingSessionSnapshot[];
    pendingSessionsForPersist(): Array<{
        id: string;
        summary: string;
        projectDir?: string;
        traceId?: string;
        mcpDetached: boolean;
        enqueuedAt: number;
    }>;
    promiseForSession(sessionId: string): Promise<ResolvedFeedback> | null;
    restoreDetachedSession(snapshot: {
        sessionId: string;
        projectDir?: string;
        traceId?: string;
        summary: string;
        enqueuedAt?: number;
    }): boolean;
    detachMcpClient(ws: WebSocket): string[];
    isMcpDetached(sessionId: string): boolean;
    waitMetaForSession(sessionId: string): {
        enqueuedAt?: number;
        mcpDetached: boolean;
        wsReadyState?: number;
        traceId?: string;
    } | undefined;
    mcpTransportForSession(sessionId: string): WebSocket | undefined;
    /** Live MCP wait for hooks — blocks duplicate interactive_feedback on same trace. */
    liveWaitForTrace(traceId: string | undefined): {
        sessionId: string;
        detached: boolean;
    } | null;
    /** MCP transports with live (non-detached) pending sessions — protected from normal stale sweep. */
    activeMcpClients(): WebSocket[];
    tryAttachHandlers(sessionId: string): boolean;
    rejectAll(error: Error): void;
    private _addSubscriber;
    private _transportsFor;
    private _firstOpenSubscriber;
    private _hasOpenTransport;
    private _traceCompatible;
    private _resolvedFeedback;
}
