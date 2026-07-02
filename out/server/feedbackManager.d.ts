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
export declare class FeedbackManager {
    private queue;
    enqueue(mcpClient: WebSocket, projectDir?: string, summary?: string): {
        sessionId: string;
        promise: Promise<ResolvedFeedback>;
    };
    resolveFirst(result: FeedbackResult): boolean;
    resolveBySessionId(sessionId: string, result: FeedbackResult): boolean;
    updateTransport(newWs: WebSocket, projectDir?: string, summary?: string): {
        updated: boolean;
        sessionId?: string;
    };
    hasPending(): boolean;
    pendingCount(): number;
    pendingSessions(): PendingSessionSnapshot[];
    rejectAll(error: Error): void;
}
