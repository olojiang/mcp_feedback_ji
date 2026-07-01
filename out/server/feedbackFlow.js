"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackFlow = void 0;
class FeedbackFlow {
    constructor(deps) {
        this.deps = deps;
    }
    setOnFeedbackRequested(cb) {
        this.deps.onFeedbackRequested = cb;
    }
    setOnFeedbackResolved(cb) {
        this.deps.onFeedbackResolved = cb;
    }
    setOnFeedbackError(cb) {
        this.deps.onFeedbackError = cb;
    }
    handleFeedbackRequest(mcpWs, req) {
        this.deps.log(`feedbackRequest: project=${req.project_directory ?? '(none)'} summary=${req.summary.slice(0, 80)}`);
        const transport = this.deps.feedback.updateTransport(mcpWs, req.project_directory, req.summary);
        if (transport.updated) {
            this.deps.log(`feedbackRequest: transport updated session=${transport.sessionId ?? 'unknown'}`);
            this.deps.addMessage({
                role: 'ai',
                content: req.summary,
                timestamp: new Date().toISOString(),
            });
            this.deps.broadcastSessionUpdated(req.summary, transport.sessionId);
            return;
        }
        this.deps.addMessage({
            role: 'ai',
            content: req.summary,
            timestamp: new Date().toISOString(),
        });
        const { sessionId, promise } = this.deps.feedback.enqueue(mcpWs, req.project_directory, req.summary);
        this.deps.log(`feedbackRequest: enqueued session=${sessionId}`);
        this.deps.broadcastSessionUpdated(req.summary, sessionId);
        this.deps.onFeedbackRequested?.();
        promise.then((resolved) => {
            this.deps.sendResult(resolved.transport, {
                feedback: resolved.feedback,
                images: resolved.images,
            });
        }).catch((err) => {
            const reason = err instanceof Error ? err.message : 'Feedback error';
            this.deps.log(`feedbackRequest failed: ${reason}`);
            this.deps.sendError(mcpWs, err instanceof Error ? err : new Error(reason));
            this.deps.onFeedbackError?.(reason);
        });
    }
    handleFeedbackResponse(res) {
        this.deps.log(`feedbackResponse: session=${res.session_id ?? '(first)'} feedback=${res.feedback.slice(0, 80)}`);
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
    handleDismiss() {
        const resolved = this.deps.feedback.resolveFirst({ feedback: '[Dismissed by user]' });
        if (!resolved) {
            this.deps.log('dismiss ignored: no pending feedback request');
            return;
        }
        this.deps.broadcastFeedbackSubmitted();
        this.deps.onFeedbackResolved?.();
    }
}
exports.FeedbackFlow = FeedbackFlow;
//# sourceMappingURL=feedbackFlow.js.map