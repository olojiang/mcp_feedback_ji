import { WebSocket } from 'ws';
import type { ConversationMessage } from '../types';
import { FeedbackManager } from './feedbackManager';
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
        feedback: string;
        images?: string[];
    }) => void;
    sendError: (ws: WebSocket, error: Error) => void;
    onFeedbackRequested?: () => void;
    onFeedbackResolved?: () => void;
    onFeedbackError?: (reason: string) => void;
    log: (msg: string) => void;
}
export declare class FeedbackFlow {
    private readonly deps;
    constructor(deps: FeedbackFlowDeps);
    setOnFeedbackRequested(cb?: () => void): void;
    setOnFeedbackResolved(cb?: () => void): void;
    setOnFeedbackError(cb?: (reason: string) => void): void;
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
