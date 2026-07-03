import { WebSocket } from 'ws';
import type { ConversationMessage } from '../types';
import { FeedbackManager } from './feedbackManager';
import { PipelineHop, pipelineTraceLine } from '../pipelineContracts';
import {
    feedbackRequestAcceptedLogLine,
    feedbackResponseLogLine,
} from '../feedbackDelivery';
import { hubAcceptsProject, projectMismatchLogLine } from '../workspaceMatch';
import { resolveTraceId } from '../traceContext';

interface FeedbackFlowDeps {
    feedback: FeedbackManager;
    getHubWorkspaces: () => string[];
    appendReminder: (feedback: string) => string;
    addMessage: (msg: ConversationMessage) => void;
    broadcastSessionUpdated: (
        summary: string,
        sessionId?: string,
        projectDirectory?: string,
        traceId?: string,
    ) => void;
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

    handleFeedbackRequest(
        mcpWs: WebSocket,
        req: { summary: string; project_directory?: string; trace_id?: string },
    ): void {
        if (req.project_directory && !hubAcceptsProject(this.deps.getHubWorkspaces(), req.project_directory)) {
            this.deps.log(projectMismatchLogLine(req.project_directory, this.deps.getHubWorkspaces()));
            this.deps.sendError(
                mcpWs,
                new Error(
                    `Project mismatch: this hub serves ${this.deps.getHubWorkspaces().join(', ')}, `
                    + `not ${req.project_directory}`,
                ),
            );
            return;
        }

        const traceId = resolveTraceId(req.trace_id);

        this.deps.log(
            `feedbackRequest: project=${req.project_directory ?? '(none)'} summary=${req.summary.slice(0, 80)}`,
        );

        const transport = this.deps.feedback.updateTransport(
            mcpWs,
            req.project_directory,
            req.summary,
        );
        if (transport.updated && transport.sessionId) {
            this.deps.log(
                `feedbackRequest: transport updated session=${transport.sessionId ?? 'unknown'}`,
            );
            this.deps.addMessage({
                role: 'ai',
                content: req.summary,
                timestamp: new Date().toISOString(),
            });
            this.deps.broadcastSessionUpdated(
                req.summary,
                transport.sessionId,
                req.project_directory,
                traceId,
            );
            this.deps.onFeedbackRequested?.();
            this._attachMcpPromiseHandlers(mcpWs, transport.sessionId);
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
            traceId,
        );
        this.deps.log(pipelineTraceLine(PipelineHop.HUB_ENQUEUE, `session=${sessionId} project=${req.project_directory ?? '(none)'}`));
        this.deps.log(`feedbackRequest: enqueued session=${sessionId}`);
        this.deps.log(feedbackRequestAcceptedLogLine(sessionId, req.project_directory, traceId));
        this.deps.broadcastSessionUpdated(req.summary, sessionId, req.project_directory, traceId);
        this.deps.onFeedbackRequested?.();
        this._attachMcpPromiseHandlers(mcpWs, sessionId);
    }

    private _attachMcpPromiseHandlers(mcpWs: WebSocket, sessionId: string): void {
        if (!this.deps.feedback.tryAttachHandlers(sessionId)) return;
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

    handleFeedbackResponse(res: {
        feedback: string;
        images?: string[];
        session_id?: string;
        project_directory?: string;
    }): void {
        const project = this._resolveProject(res);
        if (res.project_directory && !hubAcceptsProject(this.deps.getHubWorkspaces(), res.project_directory)) {
            this.deps.log(projectMismatchLogLine(res.project_directory, this.deps.getHubWorkspaces()));
            this.deps.log('feedbackResponse: rejected project_mismatch from panel');
            return;
        }

        this.deps.log(
            pipelineTraceLine(
                PipelineHop.UI_RESPONSE,
                `session=${res.session_id ?? '(first)'} project=${project ?? '(unknown)'} len=${res.feedback.length}`,
            ),
        );
        const responseTraceId = this._sessionTrace(res.session_id);
        this.deps.log(feedbackResponseLogLine(
            res.session_id ?? '(first)',
            project,
            res.feedback.slice(0, 80),
            responseTraceId,
        ));

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
        let resolved = false;
        if (res.session_id) {
            resolved = this.deps.feedback.resolveBySessionId(res.session_id, payload);
            if (!resolved && this.deps.feedback.pendingCount() === 1) {
                this.deps.log(
                    `feedbackResponse: stale session_id=${res.session_id}, fallback to sole pending session`,
                );
                resolved = this.deps.feedback.resolveFirst(payload);
            }
        } else {
            resolved = this.deps.feedback.resolveFirst(payload);
        }
        if (!resolved) {
            this.deps.log('feedbackResponse: no pending session, routing to pending queue');
            this.deps.queueAsPending(res.feedback, res.images);
            return;
        }
        this.deps.broadcastFeedbackSubmitted(res.feedback, res.session_id);
        this.deps.onFeedbackResolved?.();
    }

    private _resolveProject(res: { session_id?: string }): string | undefined {
        if (res.session_id) {
            const direct = this._sessionProject(res.session_id);
            if (direct) return direct;
        }
        const pending = this.deps.feedback.pendingSessions();
        if (pending.length === 1) return pending[0].projectDir;
        return undefined;
    }

    private _sessionProject(sessionId?: string): string | undefined {
        if (!sessionId) return undefined;
        const snap = this.deps.feedback.pendingSessions().find((s) => s.id === sessionId);
        return snap?.projectDir;
    }

    private _sessionTrace(sessionId?: string): string | undefined {
        if (!sessionId) return undefined;
        return this.deps.feedback.pendingSessions().find((s) => s.id === sessionId)?.traceId;
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
