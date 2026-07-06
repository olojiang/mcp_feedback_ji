"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackFlow = void 0;
const ws_1 = require("ws");
const pipelineContracts_1 = require("../pipelineContracts");
const feedbackDelivery_1 = require("../feedbackDelivery");
const workspaceMatch_1 = require("../workspaceMatch");
const traceContext_1 = require("../traceContext");
const sessionLifecycleLog_1 = require("../sessionLifecycleLog");
const fileStore_1 = require("../fileStore");
const sessionJournal_1 = require("../sessionJournal");
const panelSubmitOutcome_1 = require("../panelSubmitOutcome");
const DEFAULT_STALE_DUPLICATE_RELEASE_MS = 35 * 60 * 1000;
function staleDuplicateReleaseMs() {
    const raw = Number(process.env.MCP_FEEDBACK_STALE_DUPLICATE_RELEASE_MS);
    return Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : DEFAULT_STALE_DUPLICATE_RELEASE_MS;
}
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
    /** Attach delivery handlers for sessions restored from disk (mcp detached). */
    attachRestoredSessionHandlers(sessionId) {
        const transport = this.deps.feedback.mcpTransportForSession(sessionId);
        if (!transport)
            return;
        const meta = this.deps.feedback.waitMetaForSession(sessionId);
        this.deps.log([
            'event=restored_session_handlers',
            `session=${sessionId}`,
            `mcp_detached=${meta?.mcpDetached === true}`,
            `ws_ready_state=${transport.readyState}`,
            `trace=${meta?.traceId || '-'}`,
        ].join(' '));
        this._attachMcpPromiseHandlers(transport, sessionId);
    }
    /** When MCP WS registers, re-bind detached pending sessions for this hub. */
    reattachDetachedOnMcpConnect(mcpWs, traceId) {
        const reattached = this.deps.feedback.reattachDetachedForHub(mcpWs, this.deps.getHubWorkspaces(), traceId);
        if (!reattached.length)
            return reattached;
        this.deps.log([
            'event=mcp_reattach_detached',
            `sessions=${reattached.join(',')}`,
            `ws_ready_state=${mcpWs.readyState}`,
        ].join(' '));
        for (const sessionId of reattached) {
            this._attachMcpPromiseHandlers(mcpWs, sessionId);
        }
        return reattached;
    }
    _notifyAgentTurnEnded(sessionId, reason, detail, traceId) {
        if (!sessionId)
            return;
        this.deps.broadcastAgentTurnStatus?.(sessionId, reason, detail, traceId);
    }
    _auditSession(event, input) {
        const agentCtx = (0, fileStore_1.readAgentContext)();
        const cursorTraceId = (0, traceContext_1.resolveTraceId)(input.traceId, agentCtx?.traceId);
        const workspaceRoots = agentCtx?.workspaceRoots?.length
            ? agentCtx.workspaceRoots
            : this.deps.getHubWorkspaces();
        const hub = this.deps.getHubMeta?.();
        const continuation = event === 'transport_reuse'
            || event === 'trace_reuse'
            || event === 'trace_steal';
        const { traceId: _drop, ...rest } = input;
        this.deps.log((0, sessionLifecycleLog_1.formatSessionLifecycleLine)({
            event,
            ...rest,
            cursorTraceId,
            workspaceRoots,
            hubPort: hub?.port,
            hubPid: hub?.pid,
            continuation,
        }));
        const journalFn = this.deps.appendSessionJournal;
        if (journalFn) {
            journalFn((0, sessionJournal_1.buildSessionJournalRecord)({
                event,
                feedbackSessionId: input.sessionId,
                cursorTraceId,
                projectDirectory: input.project,
                workspaceRoots,
                hubPort: hub?.port,
                hubPid: hub?.pid,
                mcpConnId: input.mcpConnId,
                mcpReadyState: input.mcpReadyState,
                pendingCount: input.pendingCount,
                reason: input.reason ?? input.detail,
                summaryPreview: input.summaryPreview,
            }));
        }
    }
    _handleTraceReuse(mcpWs, req, traceId) {
        const traceReuse = this.deps.feedback.reuseByTraceId(mcpWs, traceId, req.summary);
        if (traceReuse.action === 'none')
            return false;
        if (traceReuse.action === 'duplicate') {
            const waitAgeMs = traceReuse.enqueuedAt ? Date.now() - traceReuse.enqueuedAt : 0;
            const staleReleaseMs = staleDuplicateReleaseMs();
            if (waitAgeMs >= staleReleaseMs) {
                this._auditSession('trace_duplicate_blocked', {
                    sessionId: traceReuse.sessionId,
                    project: req.project_directory,
                    traceId,
                    mcpReadyState: mcpWs.readyState,
                    pendingCount: this.deps.feedback.pendingCount(),
                    reason: 'stale_duplicate_release',
                    summaryPreview: req.summary,
                });
                this.deps.log(`feedbackRequest: stale_duplicate_release session=${traceReuse.sessionId ?? 'unknown'}`
                    + ` wait_ms=${waitAgeMs} threshold_ms=${staleReleaseMs}`);
                this.deps.sendResult(mcpWs, {
                    status: 'released_duplicate',
                    feedback: '',
                    session_id: traceReuse.sessionId,
                    trace_id: traceId,
                });
                return true;
            }
            this._auditSession('trace_duplicate_blocked', {
                sessionId: traceReuse.sessionId,
                project: req.project_directory,
                traceId,
                mcpReadyState: mcpWs.readyState,
                pendingCount: this.deps.feedback.pendingCount(),
                reason: 'same_mcp_ws_same_trace',
                summaryPreview: req.summary,
            });
            this.deps.log(`feedbackRequest: already_pending session=${traceReuse.sessionId ?? 'unknown'}`);
            this.deps.sendResult(mcpWs, {
                status: 'already_pending',
                feedback: '',
                session_id: traceReuse.sessionId,
            });
            return true;
        }
        this._auditSession(traceReuse.action === 'steal' ? 'trace_steal' : 'trace_reuse', {
            sessionId: traceReuse.sessionId,
            project: req.project_directory,
            traceId,
            mcpReadyState: mcpWs.readyState,
            pendingCount: this.deps.feedback.pendingCount(),
            reason: traceReuse.action,
            summaryPreview: req.summary,
        });
        this.deps.log(`feedbackRequest: trace ${traceReuse.action} session=${traceReuse.sessionId ?? 'unknown'}`);
        this.deps.addMessage({
            role: 'ai',
            content: req.summary,
            timestamp: new Date().toISOString(),
        });
        this.deps.broadcastSessionUpdated(req.summary, traceReuse.sessionId, req.project_directory, traceId);
        this.deps.onFeedbackRequested?.();
        this._attachMcpPromiseHandlers(mcpWs, traceReuse.sessionId);
        this.deps.sendSessionBound?.(mcpWs, {
            session_id: traceReuse.sessionId,
            trace_id: traceId,
        });
        if (traceReuse.action === 'steal') {
            this.deps.log(`feedbackRequest: trace steal subscribed prior mcp session=${traceReuse.sessionId ?? 'unknown'}`
                + (traceId ? ` trace=${traceId}` : ''));
        }
        return true;
    }
    handleFeedbackRequest(mcpWs, req) {
        if (req.project_directory && !(0, workspaceMatch_1.hubAcceptsProject)(this.deps.getHubWorkspaces(), req.project_directory)) {
            this.deps.log((0, workspaceMatch_1.projectMismatchLogLine)(req.project_directory, this.deps.getHubWorkspaces()));
            this.deps.sendError(mcpWs, new Error(`Project mismatch: this hub serves ${this.deps.getHubWorkspaces().join(', ')}, `
                + `not ${req.project_directory}`));
            return;
        }
        const traceId = (0, traceContext_1.resolveTraceId)(req.trace_id, (0, fileStore_1.readAgentContext)()?.traceId);
        this.deps.log((0, pipelineContracts_1.pipelineTraceLine)(pipelineContracts_1.PipelineHop.MCP_REQUEST, `trace=${traceId ?? '-'} project=${req.project_directory ?? '(none)'}`));
        this.deps.log(`feedbackRequest: project=${req.project_directory ?? '(none)'} summary=${req.summary.slice(0, 80)}`);
        if (this._handleTraceReuse(mcpWs, req, traceId)) {
            return;
        }
        const transport = this.deps.feedback.updateTransport(mcpWs, req.project_directory, req.summary, traceId);
        if (transport.updated && transport.sessionId) {
            this.deps.log(`feedbackRequest: transport updated session=${transport.sessionId ?? 'unknown'}`);
            this._auditSession('transport_reuse', {
                sessionId: transport.sessionId,
                project: req.project_directory,
                traceId,
                mcpReadyState: mcpWs.readyState,
                pendingCount: this.deps.feedback.pendingCount(),
                summaryPreview: req.summary,
            });
            this.deps.addMessage({
                role: 'ai',
                content: req.summary,
                timestamp: new Date().toISOString(),
            });
            this.deps.broadcastSessionUpdated(req.summary, transport.sessionId, req.project_directory, traceId);
            this.deps.onFeedbackRequested?.();
            this._attachMcpPromiseHandlers(mcpWs, transport.sessionId);
            this.deps.sendSessionBound?.(mcpWs, {
                session_id: transport.sessionId,
                trace_id: traceId,
            });
            return;
        }
        if (transport.skipReason === 'live_mcp_still_open') {
            this._auditSession('transport_skip', {
                sessionId: transport.blockedSessionId,
                project: req.project_directory,
                traceId,
                mcpReadyState: mcpWs.readyState,
                pendingCount: this.deps.feedback.pendingCount(),
                reason: transport.skipReason,
                summaryPreview: req.summary,
            });
        }
        this.deps.addMessage({
            role: 'ai',
            content: req.summary,
            timestamp: new Date().toISOString(),
        });
        const { sessionId } = this.deps.feedback.enqueue(mcpWs, req.project_directory, req.summary, traceId);
        const createReason = this.deps.feedback.explainNewSession(mcpWs, req.project_directory);
        this._auditSession('create', {
            sessionId,
            project: req.project_directory,
            traceId,
            mcpReadyState: mcpWs.readyState,
            pendingCount: this.deps.feedback.pendingCount(),
            reason: createReason,
            summaryPreview: req.summary,
        });
        this.deps.log((0, pipelineContracts_1.pipelineTraceLine)(pipelineContracts_1.PipelineHop.HUB_ENQUEUE, `session=${sessionId} project=${req.project_directory ?? '(none)'}`));
        this.deps.log(`feedbackRequest: enqueued session=${sessionId}`);
        this.deps.log((0, feedbackDelivery_1.feedbackRequestAcceptedLogLine)(sessionId, req.project_directory, traceId));
        this.deps.broadcastSessionUpdated(req.summary, sessionId, req.project_directory, traceId);
        this.deps.onFeedbackRequested?.();
        this._attachMcpPromiseHandlers(mcpWs, sessionId);
        this.deps.sendSessionBound?.(mcpWs, { session_id: sessionId, trace_id: traceId });
    }
    _attachMcpPromiseHandlers(mcpWs, sessionId) {
        if (!this.deps.feedback.tryAttachHandlers(sessionId))
            return;
        const promise = this.deps.feedback.promiseForSession(sessionId);
        if (!promise)
            return;
        promise.then((resolved) => {
            const resolvedTrace = resolved.traceId ?? this.deps.feedback.waitMetaForSession(sessionId)?.traceId;
            const resolvedWaitMs = resolved.enqueuedAt ? Date.now() - resolved.enqueuedAt : undefined;
            const openTransports = (resolved.transports ?? [resolved.transport])
                .filter((ws, idx, arr) => arr.indexOf(ws) === idx)
                .filter((ws) => this._canDeliverToMcp(ws, sessionId));
            if (openTransports.length === 0) {
                const detached = resolved.mcpDetached ?? this.deps.feedback.isMcpDetached(sessionId);
                const wsState = resolved.transport.readyState;
                this.deps.log((0, panelSubmitOutcome_1.panelSubmitNoEffectLogLine)({
                    reason: detached ? 'mcp_detached' : 'mcp_ws_not_open',
                    sessionId,
                    traceId: resolvedTrace,
                    feedbackLen: resolved.feedback.length,
                    waitMs: resolvedWaitMs,
                    mcpWsReadyState: wsState,
                    detail: detached
                        ? 'panel_reply_resolved_but_mcp_link_lost'
                        : 'panel_reply_resolved_but_mcp_ws_closed',
                }));
                this._notifyAgentTurnEnded(sessionId, 'link_lost', 'Cursor Agent 链接已断，回复已存入队列 — Settings → MCP toggle off/on', resolvedTrace);
                this.deps.log(`feedbackRequest: mcp gone session=${sessionId}, queue pending`);
                this.deps.log([
                    'event=feedback_response_queued',
                    `reason=${detached ? 'mcp_detached' : 'mcp_ws_not_open'}`,
                    `session=${sessionId}`,
                    `trace=${resolvedTrace || '-'}`,
                    `feedback_len=${resolved.feedback.length}`,
                    `image_count=${resolved.images?.length ?? 0}`,
                    `wait_ms=${resolvedWaitMs ?? '-'}`,
                    `mcp_ws_ready_state=${wsState}`,
                ].join(' '));
                this.deps.queueAsPending(resolved.feedback, resolved.images);
                if (this.deps.broadcastFeedbackUndelivered) {
                    this.deps.log((0, panelSubmitOutcome_1.feedbackUndeliveredBroadcastLogLine)({
                        sessionId,
                        traceId: resolvedTrace,
                        feedbackLen: resolved.feedback.length,
                        detail: 'panel_reply_resolved_but_mcp_link_lost',
                    }));
                    this.deps.broadcastFeedbackUndelivered(resolved.feedback, sessionId, 'Cursor Agent 链接已断 — 回复已存入队列，请 toggle MCP');
                }
                else {
                    this.deps.broadcastFeedbackSubmitted(resolved.feedback, sessionId);
                }
                this.deps.onFeedbackResolved?.();
                return;
            }
            for (const ws of openTransports) {
                this.deps.sendResult(ws, {
                    feedback: resolved.feedback,
                    images: resolved.images,
                    session_id: sessionId,
                });
            }
            this.deps.log(`feedbackDeliver: session=${sessionId} detached=false transports=${openTransports.length}`
                + ` readyState=${resolved.transport.readyState} len=${resolved.feedback.length}`);
            this.deps.log((0, panelSubmitOutcome_1.panelSubmitDeliveredLogLine)({
                sessionId,
                traceId: resolvedTrace,
                feedbackLen: resolved.feedback.length,
                waitMs: resolvedWaitMs,
                mcpWsReadyState: resolved.transport.readyState,
            }));
        }).catch((err) => {
            const reason = err instanceof Error ? err.message : 'Feedback error';
            this.deps.log(`feedbackRequest failed: ${reason}`);
            if (this._canDeliverToMcp(mcpWs, sessionId)) {
                this.deps.sendError(mcpWs, err instanceof Error ? err : new Error(reason));
            }
            this.deps.onFeedbackError?.(reason);
        });
    }
    _canDeliverToMcp(ws, sessionId) {
        if (this.deps.feedback.isMcpDetached(sessionId))
            return false;
        return ws.readyState === ws_1.WebSocket.OPEN;
    }
    handleFeedbackResponse(res) {
        const project = this._resolveProject(res);
        if (res.project_directory && !(0, workspaceMatch_1.hubAcceptsProject)(this.deps.getHubWorkspaces(), res.project_directory)) {
            this.deps.log((0, workspaceMatch_1.projectMismatchLogLine)(res.project_directory, this.deps.getHubWorkspaces()));
            this.deps.log((0, panelSubmitOutcome_1.panelSubmitNoEffectLogLine)({
                reason: 'project_mismatch',
                sessionId: res.session_id,
                project: res.project_directory,
                feedbackLen: res.feedback.length,
            }));
            this.deps.log('feedbackResponse: rejected project_mismatch from panel');
            return;
        }
        this.deps.log((0, pipelineContracts_1.pipelineTraceLine)(pipelineContracts_1.PipelineHop.UI_RESPONSE, `session=${res.session_id ?? '(first)'} project=${project ?? '(unknown)'} len=${res.feedback.length}`));
        const responseTraceId = this._sessionTrace(res.session_id);
        this.deps.log((0, feedbackDelivery_1.feedbackResponseLogLine)(res.session_id ?? '(first)', project, res.feedback, responseTraceId, res.images?.length ?? 0));
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
        const targetSessionId = res.session_id;
        const waitMeta = targetSessionId
            ? this.deps.feedback.waitMetaForSession(targetSessionId)
            : undefined;
        if (targetSessionId) {
            if (!waitMeta) {
                this.deps.log((0, panelSubmitOutcome_1.panelSubmitNoEffectLogLine)({
                    reason: 'session_not_on_hub_queue',
                    sessionId: targetSessionId,
                    traceId: responseTraceId,
                    project,
                    feedbackLen: res.feedback.length,
                    pendingCount: this.deps.feedback.pendingCount(),
                    detail: 'panel_tab_waiting_locally_but_hub_has_no_matching_pending',
                }));
                this._notifyAgentTurnEnded(targetSessionId, 'cursor_ended', 'Cursor 侧可能已结束 — 此 tab 在 Hub 无 pending，回复将存入队列', responseTraceId);
            }
            resolved = this.deps.feedback.resolveBySessionId(targetSessionId, payload);
            if (!resolved && this.deps.feedback.pendingCount() === 1) {
                this.deps.log(`feedbackResponse: stale session_id=${targetSessionId}, fallback to sole pending session`);
                resolved = this.deps.feedback.resolveFirst(payload);
            }
        }
        else {
            resolved = this.deps.feedback.resolveFirst(payload);
        }
        if (!resolved) {
            this.deps.log((0, panelSubmitOutcome_1.panelSubmitNoEffectLogLine)({
                reason: 'no_pending_session',
                sessionId: targetSessionId,
                traceId: responseTraceId,
                project,
                feedbackLen: res.feedback.length,
                pendingCount: this.deps.feedback.pendingCount(),
                detail: 'routed_to_global_pending_queue_agent_will_not_see',
            }));
            this.deps.log('feedbackResponse: no pending session, routing to pending queue');
            this.deps.log([
                'event=feedback_response_queued',
                'reason=no_pending_session',
                `session=${targetSessionId || '-'}`,
                `trace=${responseTraceId || '-'}`,
                `project=${project || '-'}`,
                `feedback_len=${res.feedback.length}`,
                `image_count=${res.images?.length ?? 0}`,
            ].join(' '));
            this.deps.queueAsPending(res.feedback, res.images);
            return;
        }
        this._auditSession('resolve', {
            sessionId: res.session_id,
            project,
            traceId: responseTraceId,
            pendingCount: this.deps.feedback.pendingCount(),
        });
        this.deps.log((0, panelSubmitOutcome_1.feedbackSubmittedBroadcastLogLine)({
            sessionId: res.session_id,
            traceId: responseTraceId,
            feedbackLen: res.feedback.length,
        }));
        this.deps.broadcastFeedbackSubmitted(res.feedback, res.session_id);
        this.deps.onFeedbackResolved?.();
    }
    _resolveProject(res) {
        if (res.session_id) {
            const direct = this._sessionProject(res.session_id);
            if (direct)
                return direct;
        }
        const pending = this.deps.feedback.pendingSessions();
        if (pending.length === 1)
            return pending[0].projectDir;
        return undefined;
    }
    _sessionProject(sessionId) {
        if (!sessionId)
            return undefined;
        const snap = this.deps.feedback.pendingSessions().find((s) => s.id === sessionId);
        return snap?.projectDir;
    }
    _sessionTrace(sessionId) {
        if (!sessionId)
            return undefined;
        return this.deps.feedback.pendingSessions().find((s) => s.id === sessionId)?.traceId;
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