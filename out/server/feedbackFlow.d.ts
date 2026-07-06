import { WebSocket } from 'ws';
import type { ConversationMessage } from '../types';
import { FeedbackManager } from './feedbackManager';
import { type SessionJournalRecord } from '../sessionJournal';
import type { AgentTurnStatusReason } from '../agentTurnStatus';
interface FeedbackFlowDeps {
    feedback: FeedbackManager;
    getHubWorkspaces: () => string[];
    appendReminder: (feedback: string) => string;
    addMessage: (msg: ConversationMessage) => void;
    broadcastSessionUpdated: (summary: string, sessionId?: string, projectDirectory?: string, traceId?: string) => void;
    broadcastFeedbackSubmitted: (feedback?: string, sessionId?: string) => void;
    clearPending: () => void;
    queueAsPending: (feedback: string, images?: string[]) => void;
    sendResult: (ws: WebSocket, result: {
        status?: string;
        feedback: string;
        images?: string[];
        session_id?: string;
    }) => void;
    sendSessionBound?: (ws: WebSocket, payload: {
        session_id: string;
        trace_id?: string;
    }) => void;
    sendError: (ws: WebSocket, error: Error) => void;
    onFeedbackRequested?: () => void;
    onFeedbackResolved?: () => void;
    onFeedbackError?: (reason: string) => void;
    log: (msg: string) => void;
    getHubMeta?: () => {
        port: number;
        pid: number;
    };
    appendSessionJournal?: (record: SessionJournalRecord) => void;
    broadcastAgentTurnStatus?: (sessionId: string, reason: AgentTurnStatusReason, detail: string, traceId?: string) => void;
}
export declare class FeedbackFlow {
    private readonly deps;
    constructor(deps: FeedbackFlowDeps);
    setOnFeedbackRequested(cb?: () => void): void;
    setOnFeedbackResolved(cb?: () => void): void;
    setOnFeedbackError(cb?: (reason: string) => void): void;
    /** Attach delivery handlers for sessions restored from disk (mcp detached). */
    attachRestoredSessionHandlers(sessionId: string): void;
    /** When MCP WS registers, re-bind detached pending sessions for this hub. */
    reattachDetachedOnMcpConnect(mcpWs: WebSocket): string[];
    private _notifyAgentTurnEnded;
    private _releaseSupersededMcp;
    private _auditSession;
    handleFeedbackRequest(mcpWs: WebSocket, req: {
        summary: string;
        project_directory?: string;
        trace_id?: string;
    }): void;
    private _attachMcpPromiseHandlers;
    private _canDeliverToMcp;
    handleFeedbackResponse(res: {
        feedback: string;
        images?: string[];
        session_id?: string;
        project_directory?: string;
    }): void;
    private _resolveProject;
    private _sessionProject;
    private _sessionTrace;
    handleDismiss(): void;
}
export {};
