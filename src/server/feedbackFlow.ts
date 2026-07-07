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
import { formatSessionLifecycleLine, type SessionLifecycleEvent, type SessionLifecycleFields } from '../sessionLifecycleLog';
import { readAgentContext } from '../fileStore';
import { buildSessionJournalRecord, type SessionJournalRecord } from '../sessionJournal';
import {
    panelSubmitDeliveredLogLine,
    feedbackSubmittedBroadcastLogLine,
    feedbackUndeliveredBroadcastLogLine,
    panelSubmitNoEffectLogLine,
} from '../panelSubmitOutcome';
import type { AgentTurnStatusReason } from '../agentTurnStatus';

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
    broadcastFeedbackUndelivered?: (feedback: string, sessionId: string, detail: string) => void;
    clearPending: () => void;
    queueAsPending: (feedback: string, images?: string[]) => void;
    sendResult: (ws: WebSocket, result: {
        status?: string;
        feedback: string;
        images?: string[];
        session_id?: string;
        trace_id?: string;
    }) => void;
    sendSessionBound?: (ws: WebSocket, payload: { session_id: string; trace_id?: string }) => void;
    sendError: (ws: WebSocket, error: Error) => void;
    onFeedbackRequested?: () => void;
    onFeedbackResolved?: () => void;
    onFeedbackError?: (reason: string) => void;
    log: (msg: string) => void;
    getHubMeta?: () => { port: number; pid: number };
    appendSessionJournal?: (record: SessionJournalRecord) => void;
    broadcastAgentTurnStatus?: (
        sessionId: string,
        reason: AgentTurnStatusReason,
        detail: string,
        traceId?: string,
    ) => void;
}

const DEFAULT_STALE_DUPLICATE_RELEASE_MS = 35 * 60 * 1000;

function staleDuplicateReleaseMs(): number {
    const raw = Number(process.env.MCP_FEEDBACK_STALE_DUPLICATE_RELEASE_MS);
    return Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : DEFAULT_STALE_DUPLICATE_RELEASE_MS;
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

    /** Attach delivery handlers for sessions restored from disk (mcp detached). */
    attachRestoredSessionHandlers(sessionId: string): void {
        const transport = this.deps.feedback.mcpTransportForSession(sessionId);
        if (!transport) return;
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
    reattachDetachedOnMcpConnect(mcpWs: WebSocket, traceId?: string): string[] {
        const reattached = this.deps.feedback.reattachDetachedForHub(
            mcpWs,
            this.deps.getHubWorkspaces(),
            traceId,
        );
        if (!reattached.length) return reattached;
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

    private _notifyAgentTurnEnded(
        sessionId: string | undefined,
        reason: AgentTurnStatusReason,
        detail: string,
        traceId?: string,
    ): void {
        if (!sessionId) return;
        this.deps.broadcastAgentTurnStatus?.(sessionId, reason, detail, traceId);
    }

    private _auditSession(
        event: SessionLifecycleEvent,
        input: Omit<SessionLifecycleFields, 'event' | 'cursorTraceId' | 'workspaceRoots' | 'hubPort' | 'hubPid' | 'continuation'> & { traceId?: string },
    ): void {
        const agentCtx = readAgentContext();
        const cursorTraceId = resolveTraceId(input.traceId, agentCtx?.traceId);
        const workspaceRoots = agentCtx?.workspaceRoots?.length
            ? agentCtx.workspaceRoots
            : this.deps.getHubWorkspaces();
        const hub = this.deps.getHubMeta?.();
        const continuation = event === 'transport_reuse'
            || event === 'trace_reuse'
            || event === 'trace_steal';
        const { traceId: _drop, ...rest } = input;
        this.deps.log(formatSessionLifecycleLine({
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
            journalFn(buildSessionJournalRecord({
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

    private _handleTraceReuse(
        mcpWs: WebSocket,
        req: { summary: string; project_directory?: string; trace_id?: string },
        traceId?: string,
    ): boolean {
        const traceReuse = this.deps.feedback.reuseByTraceId(mcpWs, traceId, req.summary);
        if (traceReuse.action === 'none') return false;
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
                this.deps.log(
                    `feedbackRequest: stale_duplicate_release session=${traceReuse.sessionId ?? 'unknown'}`
                    + ` wait_ms=${waitAgeMs} threshold_ms=${staleReleaseMs}`,
                );
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
            this.deps.log(
                `feedbackRequest: already_pending session=${traceReuse.sessionId ?? 'unknown'}`,
            );
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
        this.deps.log(
            `feedbackRequest: trace ${traceReuse.action} session=${traceReuse.sessionId ?? 'unknown'}`,
        );
        this.deps.addMessage({
            role: 'ai',
            content: req.summary,
            timestamp: new Date().toISOString(),
        });
        this.deps.broadcastSessionUpdated(
            req.summary,
            traceReuse.sessionId,
            req.project_directory,
            traceId,
        );
        this.deps.onFeedbackRequested?.();
        this._attachMcpPromiseHandlers(mcpWs, traceReuse.sessionId!);
        this.deps.sendSessionBound?.(mcpWs, {
            session_id: traceReuse.sessionId!,
            trace_id: traceId,
        });
        if (traceReuse.action === 'steal') {
            this.deps.log(
                `feedbackRequest: trace steal subscribed prior mcp session=${traceReuse.sessionId ?? 'unknown'}`
                + (traceId ? ` trace=${traceId}` : ''),
            );
        }
        return true;
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

        const traceId = resolveTraceId(req.trace_id, readAgentContext()?.traceId);

        this.deps.log(pipelineTraceLine(
            PipelineHop.MCP_REQUEST,
            `trace=${traceId ?? '-'} project=${req.project_directory ?? '(none)'}`,
        ));

        this.deps.log(
            `feedbackRequest: project=${req.project_directory ?? '(none)'} summary=${req.summary.slice(0, 80)}`,
        );

        if (this._handleTraceReuse(mcpWs, req, traceId)) {
            return;
        }

        const transport = this.deps.feedback.updateTransport(
            mcpWs,
            req.project_directory,
            req.summary,
            traceId,
        );
        if (transport.updated && transport.sessionId) {
            this.deps.log(
                `feedbackRequest: transport updated session=${transport.sessionId ?? 'unknown'}`,
            );
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
            this.deps.broadcastSessionUpdated(
                req.summary,
                transport.sessionId,
                req.project_directory,
                traceId,
            );
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

        const { sessionId } = this.deps.feedback.enqueue(
            mcpWs,
            req.project_directory,
            req.summary,
            traceId,
        );
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
        this.deps.log(pipelineTraceLine(PipelineHop.HUB_ENQUEUE, `session=${sessionId} project=${req.project_directory ?? '(none)'}`));
        this.deps.log(`feedbackRequest: enqueued session=${sessionId}`);
        this.deps.log(feedbackRequestAcceptedLogLine(sessionId, req.project_directory, traceId));
        this.deps.broadcastSessionUpdated(req.summary, sessionId, req.project_directory, traceId);
        this.deps.onFeedbackRequested?.();
        this._attachMcpPromiseHandlers(mcpWs, sessionId);
        this.deps.sendSessionBound?.(mcpWs, { session_id: sessionId, trace_id: traceId });
    }

    private _attachMcpPromiseHandlers(mcpWs: WebSocket, sessionId: string): void {
        if (!this.deps.feedback.tryAttachHandlers(sessionId)) return;
        const promise = this.deps.feedback.promiseForSession(sessionId);
        if (!promise) return;
        promise.then((resolved) => {
            const resolvedTrace = resolved.traceId ?? this.deps.feedback.waitMetaForSession(sessionId)?.traceId;
            const resolvedWaitMs = resolved.enqueuedAt ? Date.now() - resolved.enqueuedAt : undefined;
            const openTransports = (resolved.transports ?? [resolved.transport])
                .filter((ws, idx, arr) => arr.indexOf(ws) === idx)
                .filter((ws) => this._canDeliverToMcp(ws, sessionId));
            if (openTransports.length === 0) {
                const detached = resolved.mcpDetached ?? this.deps.feedback.isMcpDetached(sessionId);
                const wsState = resolved.transport.readyState;
                this.deps.log(panelSubmitNoEffectLogLine({
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
                this._notifyAgentTurnEnded(
                    sessionId,
                    'link_lost',
                    'Cursor Agent 链接已断，回复已存入队列 — Settings → MCP toggle off/on',
                    resolvedTrace,
                );
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
                    this.deps.log(feedbackUndeliveredBroadcastLogLine({
                        sessionId,
                        traceId: resolvedTrace,
                        feedbackLen: resolved.feedback.length,
                        detail: 'panel_reply_resolved_but_mcp_link_lost',
                    }));
                    this.deps.broadcastFeedbackUndelivered(
                        resolved.feedback,
                        sessionId,
                        'Cursor Agent 链接已断 — 回复已存入队列，请 toggle MCP',
                    );
                } else {
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
            this.deps.log(
                `feedbackDeliver: session=${sessionId} detached=false transports=${openTransports.length}`
                + ` readyState=${resolved.transport.readyState} len=${resolved.feedback.length}`,
            );
            this.deps.log(panelSubmitDeliveredLogLine({
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
            this.deps.log(panelSubmitNoEffectLogLine({
                reason: 'project_mismatch',
                sessionId: res.session_id,
                project: res.project_directory,
                feedbackLen: res.feedback.length,
            }));
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
            res.feedback,
            responseTraceId,
            res.images?.length ?? 0,
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
        const targetSessionId = res.session_id;
        const waitMeta = targetSessionId
            ? this.deps.feedback.waitMetaForSession(targetSessionId)
            : undefined;
        if (targetSessionId) {
            if (!waitMeta) {
                this.deps.log(panelSubmitNoEffectLogLine({
                    reason: 'session_not_on_hub_queue',
                    sessionId: targetSessionId,
                    traceId: responseTraceId,
                    project,
                    feedbackLen: res.feedback.length,
                    pendingCount: this.deps.feedback.pendingCount(),
                    detail: 'panel_tab_waiting_locally_but_hub_has_no_matching_pending',
                }));
                this._notifyAgentTurnEnded(
                    targetSessionId,
                    'cursor_ended',
                    'Cursor 侧可能已结束 — 此 tab 在 Hub 无 pending，回复将存入队列',
                    responseTraceId,
                );
            }
            resolved = this.deps.feedback.resolveBySessionId(targetSessionId, payload);
            if (!resolved && this.deps.feedback.pendingCount() === 1) {
                this.deps.log(
                    `feedbackResponse: stale session_id=${targetSessionId}, fallback to sole pending session`,
                );
                resolved = this.deps.feedback.resolveFirst(payload);
            }
        } else {
            resolved = this.deps.feedback.resolveFirst(payload);
        }
        if (!resolved) {
            this.deps.log(panelSubmitNoEffectLogLine({
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
        this.deps.log(feedbackSubmittedBroadcastLogLine({
            sessionId: res.session_id,
            traceId: responseTraceId,
            feedbackLen: res.feedback.length,
        }));
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

    handleDismiss(sessionId?: string): void {
        const resolved = sessionId
            ? this.deps.feedback.resolveBySessionId(sessionId, { feedback: '[Dismissed by user]' })
            : this.deps.feedback.resolveFirst({ feedback: '[Dismissed by user]' });
        if (!resolved) {
            this.deps.log(`dismiss ignored: no pending feedback request session=${sessionId ?? '(first)'}`);
            return;
        }
        this.deps.broadcastFeedbackSubmitted(undefined, sessionId);
        this.deps.onFeedbackResolved?.();
    }
}
