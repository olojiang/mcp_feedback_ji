"use strict";
/**
 * FIFO queue of pending feedback requests.
 *
 * On MCP disconnect, sessions stay alive so the panel can respond.
 * On reconnect for the same trace/project (dead MCP ws), transport is swapped via updateTransport().
 * A live MCP connection for the same project always creates a new session tab.
 * resolve returns the *current* transport (not the one captured at enqueue time).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackManager = void 0;
const ws_1 = require("ws");
function newSessionId() {
    return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function isMcpTransportOpen(ws) {
    return ws.readyState === ws_1.WebSocket.OPEN || ws.readyState === ws_1.WebSocket.CONNECTING;
}
class FeedbackManager {
    constructor() {
        this.queue = [];
        this.promises = new Map();
    }
    enqueue(mcpClient, projectDir, summary = '', traceId) {
        const sessionId = newSessionId();
        const promise = new Promise((resolve, reject) => {
            this.queue.push({
                sessionId, mcpClient, projectDir, traceId, summary,
                enqueuedAt: Date.now(),
                resolve, reject,
            });
        });
        this.promises.set(sessionId, promise);
        return { sessionId, promise };
    }
    resolveFirst(result) {
        const entry = this.queue.shift();
        if (!entry)
            return false;
        this.promises.delete(entry.sessionId);
        entry.resolve(this._resolvedFeedback(entry, result));
        return true;
    }
    resolveBySessionId(sessionId, result) {
        const idx = this.queue.findIndex((entry) => entry.sessionId === sessionId);
        if (idx < 0)
            return false;
        const entry = this.queue.splice(idx, 1)[0];
        this.promises.delete(sessionId);
        entry.resolve(this._resolvedFeedback(entry, result));
        return true;
    }
    updateTransport(newWs, projectDir, summary, traceId) {
        const matchProject = projectDir || undefined;
        if (!matchProject)
            return { updated: false, skipReason: 'no_project' };
        let blockedSessionId;
        for (const entry of this.queue) {
            if (entry.projectDir !== matchProject)
                continue;
            if (!this._traceCompatible(entry.traceId, traceId))
                continue;
            if (!isMcpTransportOpen(entry.mcpClient)) {
                entry.mcpClient = newWs;
                entry.mcpDetached = false;
                if (summary)
                    entry.summary = summary;
                return { updated: true, sessionId: entry.sessionId };
            }
            blockedSessionId = entry.sessionId;
        }
        if (blockedSessionId) {
            return { updated: false, skipReason: 'live_mcp_still_open', blockedSessionId };
        }
        return { updated: false, skipReason: 'no_pending' };
    }
    /** Reattach detached pending sessions when MCP WS reconnects to hub. */
    reattachDetachedForHub(newWs, hubWorkspaces, traceId) {
        if (!traceId)
            return [];
        const soleWorkspace = hubWorkspaces.length === 1 ? hubWorkspaces[0] : undefined;
        const candidates = [];
        for (const entry of this.queue) {
            if (!entry.mcpDetached)
                continue;
            if (entry.traceId !== traceId)
                continue;
            const projectMatch = entry.projectDir
                ? hubWorkspaces.includes(entry.projectDir)
                : soleWorkspace !== undefined;
            if (!projectMatch)
                continue;
            candidates.push(entry);
        }
        if (candidates.length !== 1) {
            return [];
        }
        const entry = candidates[0];
        entry.mcpClient = newWs;
        entry.mcpDetached = false;
        if (!entry.projectDir && soleWorkspace) {
            entry.projectDir = soleWorkspace;
        }
        return [entry.sessionId];
    }
    /** Same agent trace reconnecting or duplicate MCP call — reuse tab instead of new session. */
    reuseByTraceId(mcpWs, traceId, summary) {
        if (!traceId)
            return { action: 'none' };
        for (const entry of this.queue) {
            if (entry.traceId !== traceId)
                continue;
            if (entry.mcpClient === mcpWs) {
                return {
                    action: 'duplicate',
                    sessionId: entry.sessionId,
                    enqueuedAt: entry.enqueuedAt,
                };
            }
            const supersededWs = entry.mcpClient;
            if (!isMcpTransportOpen(supersededWs)) {
                entry.mcpClient = mcpWs;
                entry.mcpDetached = false;
                if (summary)
                    entry.summary = summary;
                return {
                    action: 'reuse',
                    sessionId: entry.sessionId,
                    supersededWs: supersededWs !== mcpWs ? supersededWs : undefined,
                };
            }
            entry.mcpClient = mcpWs;
            entry.mcpDetached = false;
            this._addSubscriber(entry, supersededWs);
            if (summary)
                entry.summary = summary;
            return { action: 'steal', sessionId: entry.sessionId };
        }
        return { action: 'none' };
    }
    duplicateByTransport(mcpWs) {
        for (const entry of this.queue) {
            if (entry.mcpDetached)
                continue;
            if (!isMcpTransportOpen(entry.mcpClient))
                continue;
            if (entry.mcpClient === mcpWs) {
                return {
                    duplicate: true,
                    sessionId: entry.sessionId,
                    enqueuedAt: entry.enqueuedAt,
                };
            }
            if (entry.subscriberClients?.has(mcpWs)) {
                return {
                    duplicate: true,
                    sessionId: entry.sessionId,
                    enqueuedAt: entry.enqueuedAt,
                };
            }
        }
        return { duplicate: false };
    }
    explainNewSession(mcpWs, projectDir) {
        if (!projectDir)
            return 'no_project_directory';
        const sameProject = this.queue.filter((e) => e.projectDir === projectDir);
        if (sameProject.length === 0)
            return 'new_request';
        const liveOther = sameProject.filter((e) => isMcpTransportOpen(e.mcpClient) && e.mcpClient !== mcpWs);
        if (liveOther.length > 0) {
            return `parallel_live_mcp:${liveOther.map((e) => e.sessionId).join('|')}`;
        }
        return 'new_request';
    }
    hasPending() {
        return this.queue.length > 0;
    }
    pendingCount() {
        return this.queue.length;
    }
    pendingSessions() {
        return this.queue.map((entry) => ({
            id: entry.sessionId,
            label: entry.projectDir ?? entry.sessionId,
            summary: entry.summary,
            projectDir: entry.projectDir,
            ...(entry.traceId ? { traceId: entry.traceId } : {}),
            waiting: true,
            mcp_detached: entry.mcpDetached === true,
        }));
    }
    pendingSessionsForPersist() {
        return this.queue.map((entry) => ({
            id: entry.sessionId,
            summary: entry.summary,
            projectDir: entry.projectDir,
            traceId: entry.traceId,
            mcpDetached: entry.mcpDetached === true,
            enqueuedAt: entry.enqueuedAt,
        }));
    }
    promiseForSession(sessionId) {
        return this.promises.get(sessionId) ?? null;
    }
    restoreDetachedSession(snapshot) {
        if (this.queue.some((entry) => entry.sessionId === snapshot.sessionId)) {
            return false;
        }
        const closedWs = { readyState: 3 };
        const promise = new Promise((resolve, reject) => {
            this.queue.push({
                sessionId: snapshot.sessionId,
                mcpClient: closedWs,
                projectDir: snapshot.projectDir,
                traceId: snapshot.traceId,
                summary: snapshot.summary,
                enqueuedAt: snapshot.enqueuedAt ?? Date.now(),
                mcpDetached: true,
                resolve,
                reject,
            });
        });
        this.promises.set(snapshot.sessionId, promise);
        return true;
    }
    detachMcpClient(ws) {
        const detached = [];
        for (const entry of this.queue) {
            if (entry.subscriberClients?.delete(ws)) {
                continue;
            }
            if (entry.mcpClient === ws) {
                const replacement = this._firstOpenSubscriber(entry);
                if (replacement) {
                    entry.subscriberClients?.delete(replacement);
                    entry.mcpClient = replacement;
                    entry.mcpDetached = false;
                    continue;
                }
                entry.mcpDetached = true;
                detached.push(entry.sessionId);
            }
        }
        return detached;
    }
    isMcpDetached(sessionId) {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        return entry?.mcpDetached === true;
    }
    waitMetaForSession(sessionId) {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        if (!entry)
            return undefined;
        return {
            enqueuedAt: entry.enqueuedAt,
            mcpDetached: entry.mcpDetached === true,
            wsReadyState: entry.mcpClient.readyState,
            traceId: entry.traceId,
        };
    }
    mcpTransportForSession(sessionId) {
        return this.queue.find((item) => item.sessionId === sessionId)?.mcpClient;
    }
    /** Live MCP wait for hooks — blocks duplicate interactive_feedback on same trace. */
    liveWaitForTrace(traceId) {
        if (!traceId)
            return null;
        for (const entry of this.queue) {
            if (entry.traceId !== traceId)
                continue;
            if (entry.mcpDetached)
                continue;
            if (!this._hasOpenTransport(entry))
                continue;
            return { sessionId: entry.sessionId, detached: false };
        }
        return null;
    }
    /** MCP transports with live (non-detached) pending sessions — protected from normal stale sweep. */
    activeMcpClients() {
        const seen = new Set();
        const out = [];
        for (const entry of this.queue) {
            if (entry.mcpDetached)
                continue;
            for (const ws of this._transportsFor(entry)) {
                if (!isMcpTransportOpen(ws))
                    continue;
                if (seen.has(ws))
                    continue;
                seen.add(ws);
                out.push(ws);
            }
        }
        return out;
    }
    tryAttachHandlers(sessionId) {
        const entry = this.queue.find((item) => item.sessionId === sessionId);
        if (!entry || entry.handlersAttached)
            return false;
        entry.handlersAttached = true;
        return true;
    }
    rejectAll(error) {
        for (const entry of this.queue) {
            this.promises.delete(entry.sessionId);
            if (entry.mcpDetached)
                continue;
            entry.reject(error);
        }
        this.queue = [];
        this.promises.clear();
    }
    _addSubscriber(entry, ws) {
        if (entry.mcpClient === ws)
            return;
        if (!entry.subscriberClients)
            entry.subscriberClients = new Set();
        entry.subscriberClients.add(ws);
    }
    _transportsFor(entry) {
        const out = [];
        const seen = new Set();
        const add = (ws) => {
            if (!ws || seen.has(ws))
                return;
            seen.add(ws);
            out.push(ws);
        };
        add(entry.mcpClient);
        for (const ws of entry.subscriberClients ?? [])
            add(ws);
        return out;
    }
    _firstOpenSubscriber(entry) {
        for (const ws of entry.subscriberClients ?? []) {
            if (isMcpTransportOpen(ws))
                return ws;
        }
        return undefined;
    }
    _hasOpenTransport(entry) {
        return this._transportsFor(entry).some((ws) => isMcpTransportOpen(ws));
    }
    _traceCompatible(existingTraceId, nextTraceId) {
        if (!existingTraceId && !nextTraceId)
            return true;
        if (existingTraceId && nextTraceId)
            return existingTraceId === nextTraceId;
        return false;
    }
    _resolvedFeedback(entry, result) {
        return {
            ...result,
            transport: entry.mcpClient,
            transports: this._transportsFor(entry),
            projectDir: entry.projectDir,
            traceId: entry.traceId,
            enqueuedAt: entry.enqueuedAt,
            mcpDetached: entry.mcpDetached === true,
        };
    }
}
exports.FeedbackManager = FeedbackManager;
//# sourceMappingURL=feedbackManager.js.map