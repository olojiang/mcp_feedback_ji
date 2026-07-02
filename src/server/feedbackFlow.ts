import { WebSocket } from 'ws';
import type { ConversationMessage } from '../types';
import { FeedbackManager } from './feedbackManager';

interface FeedbackFlowDeps {
    feedback: FeedbackManager;
    appendReminder: (feedback: string) => string;
    addMessage: (msg: ConversationMessage) => void;
    broadcastSessionUpdated: (summary: string, sessionId?: string) => void;
    broadcastFeedbackSubmitted: (feedback?: string, sessionId?: string) => void;
    clearPending: () => void;
    queueAsPending: (feedback: string, images?: string[]) => void;
    sendResult: (ws: WebSocket, result: { feedback: string; images?: string[] }) => void;
    sendError: (ws: WebSocket, error: Error) => void;
    onFeedbackRequested?: () => void;
    onFeedbackResolved?: () => void;
    onFeedbackError?: (reason: string) => void;
    log: (msg: string) => void;
}

export class FeedbackFlow {
    private readonly deps: FeedbackFlowDeps;

    constructor(deps: FeedbackFlowDeps) {
        this.deps = deps;
    }

    setOnFeedbackRequested(cb?: () => void): void {
        this.deps.onFeedbackRequested = cb;
    }

    setOnFeedbackResolved(cb?: () => void): void {
        this.deps.onFeedbackResolved = cb;
    }

    setOnFeedbackError(cb?: (reason: string) => void): void {
        this.deps.onFeedbackError = cb;
    }

    handleFeedbackRequest(mcpWs: WebSocket, req: { summary: string; project_directory?: string }): void {
        this.deps.log(
            `feedbackRequest: project=${req.project_directory ?? '(none)'} summary=${req.summary.slice(0, 80)}`,
        );

        const transport = this.deps.feedback.updateTransport(
            mcpWs,
            req.project_directory,
            req.summary,
        );
        if (transport.updated) {
            this.deps.log(
                `feedbackRequest: transport updated session=${transport.sessionId ?? 'unknown'}`,
            );
            this.deps.addMessage({
                role: 'ai',
                content: req.summary,
                timestamp: new Date().toISOString(),
            });
            this.deps.broadcastSessionUpdated(req.summary, transport.sessionId);
            this.deps.onFeedbackRequested?.();
            return;
        }

        this.deps.addMessage({
            role: 'ai',
            content: req.summary,
            timestamp: new Date().toISOString(),
        });

        const { sessionId } = this.deps.feedback.enqueue(
            mcpWs,
            req.project_directory,
            req.summary,
        );
        this.deps.log(`feedbackRequest: enqueued session=${sessionId}`);
        this.deps.broadcastSessionUpdated(req.summary, sessionId);
        this.deps.onFeedbackRequested?.();
        this._attachMcpPromiseHandlers(mcpWs, sessionId);
    }

    private _attachMcpPromiseHandlers(mcpWs: WebSocket, sessionId: string): void {
        const promise = this.deps.feedback.promiseForSession(sessionId);
        if (!promise) return;
        promise.then((resolved) => {
            if (!this._canDeliverToMcp(resolved.transport, sessionId)) {
                this.deps.log(`feedbackRequest: mcp gone session=${sessionId}, queue pending`);
                this.deps.queueAsPending(resolved.feedback, resolved.images);
                this.deps.broadcastFeedbackSubmitted(resolved.feedback, sessionId);
                this.deps.onFeedbackResolved?.();
                return;
            }
            this.deps.sendResult(resolved.transport, {
                feedback: resolved.feedback,
                images: resolved.images,
            });
        }).catch((err) => {
            const reason = err instanceof Error ? err.message : 'Feedback error';
            this.deps.log(`feedbackRequest failed: ${reason}`);
            if (this._canDeliverToMcp(mcpWs, sessionId)) {
                this.deps.sendError(mcpWs, err instanceof Error ? err : new Error(reason));
            }
            this.deps.onFeedbackError?.(reason);
        });
    }

    private _canDeliverToMcp(ws: WebSocket, sessionId: string): boolean {
        if (this.deps.feedback.isMcpDetached(sessionId)) return false;
        return ws.readyState === WebSocket.OPEN;
    }

    handleFeedbackResponse(res: { feedback: string; images?: string[]; session_id?: string }): void {
        this.deps.log(
            `feedbackResponse: session=${res.session_id ?? '(first)'} feedback=${res.feedback.slice(0, 80)}`,
        );

        this.deps.addMessage({
            role: 'user',
            content: res.feedback,
            timestamp: new Date().toISOString(),
            images: res.images,
        });

        this.deps.clearPending();
        const payload = {
            feedback: this.deps.appendReminder(res.feedback),
            images: res.images ?? undefined,
        };
        const resolved = res.session_id
            ? this.deps.feedback.resolveBySessionId(res.session_id, payload)
            : this.deps.feedback.resolveFirst(payload);
        if (!resolved) {
            this.deps.log('feedbackResponse: no pending session, routing to pending queue');
            this.deps.queueAsPending(res.feedback, res.images);
            return;
        }
        this.deps.broadcastFeedbackSubmitted(res.feedback, res.session_id);
        this.deps.onFeedbackResolved?.();
    }

    handleDismiss(): void {
        const resolved = this.deps.feedback.resolveFirst({ feedback: '[Dismissed by user]' });
        if (!resolved) {
            this.deps.log('dismiss ignored: no pending feedback request');
            return;
        }
        this.deps.broadcastFeedbackSubmitted();
        this.deps.onFeedbackResolved?.();
    }
}
