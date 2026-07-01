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
        this.deps.log(`feedbackRequest: summary=${req.summary.slice(0, 60)}`);
        if (this.deps.feedback.updateTransport(mcpWs, req.project_directory)) {
            this.deps.log('feedbackRequest: updated transport for existing session');
            return;
        }
        this.deps.addMessage({
            role: 'ai',
            content: req.summary,
            timestamp: new Date().toISOString(),
        });
        const promise = this.deps.feedback.enqueue(mcpWs, req.project_directory);
        this.deps.broadcastSessionUpdated(req.summary);
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
        this.deps.log(`feedbackResponse: feedback=${res.feedback.slice(0, 60)}`);
        this.deps.addMessage({
            role: 'user',
            content: res.feedback,
            timestamp: new Date().toISOString(),
            images: res.images,
        });
        this.deps.clearPending();
        const resolved = this.deps.feedback.resolveFirst({
            feedback: this.deps.appendReminder(res.feedback),
            images: res.images ?? undefined,
        });
        if (!resolved) {
            this.deps.log('feedbackResponse: no pending session, routing to pending queue');
            this.deps.queueAsPending(res.feedback, res.images);
            return;
        }
        this.deps.broadcastFeedbackSubmitted(res.feedback);
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