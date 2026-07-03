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
export declare class FeedbackManager {
    private queue;
    private readonly promises;
    enqueue(mcpClient: WebSocket, projectDir?: string, summary?: string, traceId?: string): {
        sessionId: string;
        promise: Promise<ResolvedFeedback>;
    };
    resolveFirst(result: FeedbackResult): boolean;
    resolveBySessionId(sessionId: string, result: FeedbackResult): boolean;
    updateTransport(newWs: WebSocket, projectDir?: string, summary?: string): TransportUpdateResult;
    /** Same agent trace reconnecting or duplicate MCP call — reuse tab instead of new session. */
    reuseByTraceId(mcpWs: WebSocket, traceId: string | undefined, summary?: string): TraceReuseResult;
    explainNewSession(mcpWs: WebSocket, projectDir?: string): string;
    hasPending(): boolean;
    pendingCount(): number;
    pendingSessions(): PendingSessionSnapshot[];
    promiseForSession(sessionId: string): Promise<ResolvedFeedback> | null;
    detachMcpClient(ws: WebSocket): string[];
    isMcpDetached(sessionId: string): boolean;
    tryAttachHandlers(sessionId: string): boolean;
    rejectAll(error: Error): void;
}
