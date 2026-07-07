/**
 * Multi-session PanelState — testable, no DOM/WebSocket side effects.
 */
(function (exports) {
  'use strict'

  function fnv1a32(text) {
    var hash = 0x811c9dc5
    var input = String(text || '')
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  }

  function storageKeyForWorkspace(projectPath) {
    var raw = String(projectPath || '_default')
    var suffix = raw.replace(/[^a-zA-Z0-9]/g, '-').slice(-30)
    return 'mcp-fb-v5-multi-' + fnv1a32(raw) + '-' + suffix
  }

  function loadTransport() {
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try {
        return require('./panelStateTransport.js')
      } catch (e) {
        return null
      }
    }
    if (typeof window !== 'undefined' && window.PanelStateTransportModule) {
      return window.PanelStateTransportModule
    }
    return null
  }

  var transport = loadTransport()
  if (!transport) {
    transport = {
      OutboundQueue: function () { this.items = []; this.enqueue = function () { return 0 }; this.drain = function () { return [] }; this.hasFeedbackResponse = function () { return false } },
      TransportMetrics: function () { this.record = function () {}; this.snapshot = function () { return {} } },
      BridgeSessionGate: function () {
        this.ready = false
        this.registered = false
        this.initialized = false
        this.needsResync = false
        this.isReady = function () { return this.ready }
        this.resetForReconnect = function () {
          if (this.initialized) this.needsResync = true
          this.ready = false
          this.registered = false
        }
        this.onBridgeConnected = function () {
          this.ready = true
          var isFirst = !this.initialized
          if (isFirst) this.initialized = true
          var stateSync = isFirst || this.needsResync
          if (this.needsResync) this.needsResync = false
          var register = isFirst
          if (register) this.registered = true
          return { register: register, stateSync: stateSync, labels: true }
        }
        this.shouldInitFromConnectionEstablished = function () { return !this.initialized }
        this.shouldInitFromServerInfo = function () { return !this.initialized }
        this.snapshot = function () {
          return { ready: this.ready, registered: this.registered, initialized: this.initialized }
        }
      },
      transportSendWithQueue: function (m, r, s, q) { if (r()) s(m); else q(m); return r() },
      ConnectionHealth: { evaluate: function () { return { level: 'disconnected', label: 'Disconnected', detail: '', issues: [], portPid: '' } }, countStaleLocalWaiting: function () { return 0 }, workspaceLabel: function () { return '' }, formatAgentLink: function () { return '' } },
    }
    transport.OutboundQueue.prototype = { get size() { return (this.items || []).length } }
  }
  var OutboundQueue = transport.OutboundQueue
  var TransportMetrics = transport.TransportMetrics
  var BridgeSessionGate = transport.BridgeSessionGate
  var transportSendWithQueue = transport.transportSendWithQueue
  var ConnectionHealth = transport.ConnectionHealth

  function loadModule(name, globalKey) {
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try {
        return require('./' + name + '.js')
      } catch (e) {
        return null
      }
    }
    if (typeof window !== 'undefined' && window[globalKey]) {
      return window[globalKey]
    }
    return null
  }

  var uxModule = loadModule('panelStateUx', 'PanelStateUxModule')
  var markdownModule = loadModule('panelStateMarkdown', 'PanelStateMarkdownModule')
  if (!uxModule || !uxModule.DEFAULT_QUICK_REPLIES || !uxModule.DEFAULT_QUICK_REPLIES.length) {
    uxModule = {
      DEFAULT_QUICK_REPLIES: [
        { id: 'continue', label: 'Continue', text: 'Continue', icon: '' },
        { id: 'finished', label: 'Finished', text: 'Finished', icon: '', finished: true },
      ],
      attachPanelStateUx: function () {},
    }
  }
  if (!markdownModule) {
    markdownModule = { attachPanelStateMarkdown: function () {} }
  }

  function wsSend(message) {
    return { type: 'ws_send', message }
  }

  function render() {
    return { type: 'render', targets: Array.from(arguments) }
  }

  function dom(action, value) {
    return { type: 'dom', action, value }
  }

  function notify(message) {
    return { type: 'notify', message }
  }

  var PING_COMMAND = 'ping'
  var PONG_REPLY = 'pong'

  function createSession(id, label, summary, traceId) {
    return {
      id: id,
      label: label || '',
      summary: summary || '',
      traceId: traceId || '',
      messages: [],
      pendingQueue: [],
      pendingImages: [],
      inputDraft: '',
      stagedImages: [],
      waiting: true,
      mcpDetached: false,
      cursorEnded: false,
      submitInFlight: false,
      statusDetail: '',
      createdAt: Date.now(),
      projectDirectory: '',
    }
  }

  function tabTitle(session) {
    if (session.label) return session.label
    return 'Chat ' + String(session.id).slice(-6)
  }

  class PanelState {
    constructor() {
      this.sessions = {}
      this.sessionOrder = []
      this.activeSessionId = null
      this.autoReply = false
      this.autoReplyText = 'Continue'
      this.globalPendingQueue = []
      this.globalPendingImages = []
      this.hubSnapshot = null
      this.hubTimeline = []
      this.lastPendingSessionIds = []
      this.panelWorkspace = ''
      this.routingMismatch = null
      this.quickReplies = uxModule.DEFAULT_QUICK_REPLIES.map(function (q) {
        return { id: q.id, label: q.label, text: q.text, icon: q.icon || '', finished: !!q.finished }
      })
      this.inputPaneHeight = 220
      this.ctrlEnterSend = true
      this.confirmFinished = true
    }

    getActiveSession() {
      if (!this.activeSessionId) return null
      return this.sessions[this.activeSessionId] || null
    }

    ensureSession(id, label, summary, traceId, opts) {
      if (!id) return null
      if (!this.sessions[id]) {
        this.sessions[id] = createSession(id, label, summary, traceId)
        this.sessionOrder.push(id)
      } else {
        if (label) this.sessions[id].label = label
        if (summary) this.sessions[id].summary = summary
        if (traceId) this.sessions[id].traceId = traceId
        if (opts && opts.markWaiting) this.sessions[id].waiting = true
      }
      return this.sessions[id]
    }

    setActiveSession(id) {
      if (!id || !this.sessions[id]) return []
      this.activeSessionId = id
      var s = this.sessions[id]
      return [render('tabs', 'messages', 'pending', 'input', 'staged_images'), dom('set_input', s.inputDraft || '')]
    }

    _afterSessionListChange() {
      var active = this.getActiveSession()
      return [
        render('tabs', 'messages', 'pending', 'input', 'staged_images'),
        dom('set_input', active ? active.inputDraft || '' : ''),
        dom('save_state'),
      ]
    }

    _adoptActiveIfNeeded(removedIds) {
      if (removedIds.indexOf(this.activeSessionId) < 0) return
      var remaining = []
      for (var i = 0; i < this.sessionOrder.length; i++) {
        var sid = this.sessionOrder[i]
        if (removedIds.indexOf(sid) < 0 && this.sessions[sid]) remaining.push(sid)
      }
      this.activeSessionId = remaining.length ? remaining[remaining.length - 1] : null
    }

    _dismissCommandsForRemoved(ids) {
      var cmds = []
      for (var i = 0; i < ids.length; i++) {
        var sess = this.sessions[ids[i]]
        if (sess && sess.waiting) {
          cmds.push(wsSend({ type: 'dismiss_feedback', session_id: ids[i] }))
        }
      }
      return cmds
    }

    closeSession(id) {
      if (!id || !this.sessions[id]) return []
      var cmds = this._dismissCommandsForRemoved([id])
      delete this.sessions[id]
      var idx = this.sessionOrder.indexOf(id)
      if (idx >= 0) this.sessionOrder.splice(idx, 1)
      this._adoptActiveIfNeeded([id])
      return cmds.concat(this._afterSessionListChange())
    }

    closeOtherSessions(id) {
      if (!id || !this.sessions[id]) return []
      var removed = this.sessionOrder.filter(function (sid) { return sid !== id })
      var cmds = this._dismissCommandsForRemoved(removed)
      var keep = this.sessions[id]
      this.sessions = {}
      this.sessions[id] = keep
      this.sessionOrder = [id]
      this.activeSessionId = id
      return cmds.concat(this._afterSessionListChange())
    }

    closeSessionsToLeft(id) {
      if (!id || !this.sessions[id]) return []
      var idx = this.sessionOrder.indexOf(id)
      if (idx <= 0) return []
      var removed = this.sessionOrder.slice(0, idx)
      var cmds = this._dismissCommandsForRemoved(removed)
      for (var i = 0; i < removed.length; i++) delete this.sessions[removed[i]]
      this.sessionOrder = this.sessionOrder.slice(idx)
      this._adoptActiveIfNeeded(removed)
      return cmds.concat(this._afterSessionListChange())
    }

    closeResolvedSessions() {
      var removed = []
      for (var i = this.sessionOrder.length - 1; i >= 0; i--) {
        var sid = this.sessionOrder[i]
        if (this.sessions[sid] && !this.sessions[sid].waiting) {
          removed.push(sid)
          delete this.sessions[sid]
          this.sessionOrder.splice(i, 1)
        }
      }
      if (!removed.length) return []
      this._adoptActiveIfNeeded(removed)
      return this._afterSessionListChange()
    }

    get waitingCount() {
      var n = 0
      for (var i = 0; i < this.sessionOrder.length; i++) {
        var s = this.sessions[this.sessionOrder[i]]
        if (s && s.waiting) n++
      }
      return n
    }

    get panelMode() {
      var active = this.getActiveSession()
      if (active && active.waiting) return 'waiting'
      if (this.waitingCount > 0) return 'waiting-other'
      return 'idle'
    }

    handleMessage(msg) {
      if (!msg || typeof msg !== 'object' || !msg.type) return []
      switch (msg.type) {
        case 'connection_established':
          return [wsSend({ type: 'get_state' })]
        case 'state_sync':
          return this._onStateSync(msg)
        case 'session_updated':
          return this._onSessionUpdated(msg)
        case 'feedback_submitted':
          return this._onFeedbackSubmitted(msg)
        case 'feedback_undelivered':
          return this._onFeedbackUndelivered(msg)
        case 'pending_delivered':
          return this._onPendingDelivered(msg)
        case 'pending_synced':
          return this._onPendingSynced(msg)
        case 'agent_turn_status':
          return this._onAgentTurnStatus(msg)
        case 'pong':
        case 'status_update':
          return []
        default:
          return []
      }
    }

    _trackPendingSessionId(id) {
      if (!id) return
      var ids = this.lastPendingSessionIds || []
      if (ids.indexOf(id) < 0) {
        this.lastPendingSessionIds = ids.concat([id])
      }
    }

    _sessionLinkLost(sess) {
      if (!sess || !sess.id || !sess.waiting) return false
      if (sess.mcpDetached) return true
      var hub = this.hubSnapshot
      if (!hub || !hub.mcp_detached_count) return false
      if (hub.live_pending_count && hub.live_pending_count > 0) return false
      if (hub.pending_count && hub.mcp_detached_count < hub.pending_count) return false
      var ids = this.lastPendingSessionIds || []
      return ids.indexOf(sess.id) >= 0
    }

    _syncDetachedFromHub() {
      var hub = this.hubSnapshot
      if (!hub || !hub.mcp_detached_count) return
      if (hub.live_pending_count && hub.live_pending_count > 0) return
      if (hub.pending_count && hub.mcp_detached_count < hub.pending_count) return
      var ids = this.lastPendingSessionIds || []
      for (var i = 0; i < ids.length; i++) {
        var sess = this.sessions[ids[i]]
        if (sess && sess.waiting) {
          sess.mcpDetached = true
          if (!sess.statusDetail) {
            sess.statusDetail = 'Cursor Agent 已断开 — 回复将存入队列，请 toggle MCP'
          }
        }
      }
    }

    _reconcileWaitingWithServer(pendingSessions) {
      var pendingIds = {}
      for (var i = 0; i < pendingSessions.length; i++) {
        var p = pendingSessions[i]
        if (p && p.id) pendingIds[p.id] = true
      }
      for (var j = 0; j < this.sessionOrder.length; j++) {
        var sid = this.sessionOrder[j]
        var sess = this.sessions[sid]
        if (sess && sess.waiting && !pendingIds[sid]) {
          sess.waiting = false
          sess.stagedImages = []
        }
      }
    }

    _latestWaitingSessionId() {
      for (var i = this.sessionOrder.length - 1; i >= 0; i--) {
        var sid = this.sessionOrder[i]
        var s = this.sessions[sid]
        if (s && s.waiting) return sid
      }
      return null
    }

    _canSubmitToSession(sess) {
      return !!(sess && sess.waiting && !sess.submitInFlight && !sess.mcpDetached && !this._sessionLinkLost(sess))
    }

    _latestSubmittableWaitingSessionId() {
      for (var i = this.sessionOrder.length - 1; i >= 0; i--) {
        var sid = this.sessionOrder[i]
        var s = this.sessions[sid]
        if (this._canSubmitToSession(s)) return sid
      }
      return null
    }

    _applyMessagePatches(msg) {
      if (!msg.message_patches || !msg.message_patches.length) return
      for (var i = 0; i < msg.message_patches.length; i++) {
        var patch = msg.message_patches[i]
        if (patch && patch.op === 'append' && patch.messages) {
          for (var j = 0; j < patch.messages.length; j++) {
            this.hubTimeline.push(patch.messages[j])
          }
        }
      }
    }

    _onStateSync(msg) {
      this._applyMessagePatches(msg)
      if (msg.pending_sessions_unchanged) {
        this.globalPendingQueue = msg.pending_comments || []
        this.globalPendingImages = msg.pending_images || []
        if (!msg.hub_unchanged && msg.hub) {
          this.hubSnapshot = msg.hub
        }
        this._syncDetachedFromHub()
        this._reconcileWaitingWithServer(
          (this.lastPendingSessionIds || []).map(function (id) {
            return { id: id, waiting: true }
          }),
        )
        return [render('tabs', 'messages', 'pending', 'input', 'staged_images'), dom('save_state')]
      }

      var pending = msg.pending_sessions || []
      var hubWs = (msg.hub && msg.hub.workspaces) || (this.hubSnapshot && this.hubSnapshot.workspaces)
      var acceptedPending = []
      var livePendingIds = []
      var latestPendingId = null
      var latestLivePendingId = null
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i]
        var projectDir = p.project_directory || p.projectDir
        if (projectDir && !PanelState.sessionBelongsToPanel(this.panelWorkspace, projectDir, hubWs)) {
          continue
        }
        acceptedPending.push(p)
        this.ensureSession(p.id, p.label, p.summary, p.trace_id || p.traceId, { markWaiting: true })
        latestPendingId = p.id || latestPendingId
        if (p.mcp_detached !== true) {
          latestLivePendingId = p.id || latestLivePendingId
          if (p.id) livePendingIds.push(p.id)
        }
        var sessPending = this.sessions[p.id]
        if (sessPending) {
          sessPending.mcpDetached = p.mcp_detached === true
        }
        if (p.summary) {
          var sess = this.sessions[p.id]
          if (!sess.messages.length || sess.messages[sess.messages.length - 1].role !== 'ai') {
            sess.messages.push({
              role: 'ai',
              content: p.summary,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }
      this._reconcileWaitingWithServer(acceptedPending)
      var activeBeforePendingChoice = this.getActiveSession()
      var preferredPendingId = latestLivePendingId || (!activeBeforePendingChoice ? latestPendingId : null)
      if (preferredPendingId && this.sessions[preferredPendingId] && this.sessions[preferredPendingId].waiting) {
        this.activeSessionId = preferredPendingId
      } else if (!this.activeSessionId && this.sessionOrder.length > 0) {
        this.activeSessionId = this.sessionOrder[this.sessionOrder.length - 1]
      }
      this.globalPendingQueue = msg.pending_comments || []
      this.globalPendingImages = msg.pending_images || []
      this.hubSnapshot = msg.hub || null
      this.lastPendingSessionIds = acceptedPending.map(function (p) { return p.id })
      this._syncDetachedFromHub()
      var cmds = [render('tabs', 'messages', 'pending', 'input', 'staged_images'), dom('save_state')]
      if (livePendingIds.length === 1) {
        var auto = this._drainGlobalPendingForAutoSubmit(livePendingIds[0], cmds)
        if (auto) return auto
      }
      return cmds
    }

    _onAgentTurnStatus(msg) {
      var id = msg.session_id
      if (!id || !this.sessions[id]) return []
      var sess = this.sessions[id]
      sess.cursorEnded = msg.reason === 'link_lost' || msg.reason === 'cursor_ended' || msg.reason === 'cursor_maybe_idle'
      if (msg.reason === 'link_lost') sess.mcpDetached = true
      sess.statusDetail = msg.detail || ''
      sess.waiting = true
      return [
        notify({ type: 'agent-turn-status', session_id: id, reason: msg.reason, detail: sess.statusDetail }),
        render('connection', 'tabs', 'messages', 'pending', 'input'),
        dom('save_state'),
      ]
    }

    /** Preserve Hub-authoritative global pending queue before localStorage restore. */
    snapshotServerGlobalPending() {
      return {
        comments: (this.globalPendingQueue || []).slice(),
        images: (this.globalPendingImages || []).slice(),
      }
    }

    restoreServerGlobalPending(snap) {
      if (!snap) return
      var hasComments = snap.comments && snap.comments.length > 0
      var hasImages = snap.images && snap.images.length > 0
      if (!hasComments && !hasImages) return
      this.globalPendingQueue = hasComments ? snap.comments.slice() : []
      this.globalPendingImages = hasImages ? snap.images.slice() : []
    }

    _removeFromGlobalPending(text) {
      if (!text || !this.globalPendingQueue || !this.globalPendingQueue.length) return
      var trimmed = String(text).trim()
      if (!trimmed) return
      this.globalPendingQueue = this.globalPendingQueue.filter(function (c) {
        return String(c).trim() !== trimmed
      })
    }

    /** Preserve Hub-authoritative pending tabs before localStorage restore. */
    snapshotServerPendingSessions() {
      var ids = this.lastPendingSessionIds || []
      var out = []
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i]
        var sess = this.sessions[id]
        if (sess) {
          out.push({ id: id, session: JSON.parse(JSON.stringify(sess)) })
        }
      }
      return out
    }

    /** Re-apply Hub pending tabs after localStorage restore (server wins). */
    restoreServerPendingSessions(snapshot) {
      if (!snapshot || !snapshot.length) return
      var latestId = null
      for (var i = 0; i < snapshot.length; i++) {
        var item = snapshot[i]
        if (!item || !item.id || !item.session) continue
        var id = item.id
        var restored = item.session
        restored.waiting = true
        if (!this.sessions[id]) {
          this.sessions[id] = restored
          if (this.sessionOrder.indexOf(id) < 0) this.sessionOrder.push(id)
        } else {
          var local = this.sessions[id]
          local.waiting = true
          if (restored.summary) local.summary = restored.summary
          if (restored.label) local.label = restored.label
          if (restored.traceId) local.traceId = restored.traceId
          if (restored.projectDirectory) local.projectDirectory = restored.projectDirectory
          local.mcpDetached = !!restored.mcpDetached
          if (restored.statusDetail) local.statusDetail = restored.statusDetail
          if (restored.messages && restored.messages.length) {
            var localMsgs = local.messages || []
            if (!localMsgs.length || restored.messages.length > localMsgs.length) {
              local.messages = restored.messages
            }
          }
        }
        latestId = id
      }
      if (latestId && this.sessions[latestId] && this.sessions[latestId].waiting) {
        this.activeSessionId = latestId
      }
      this._syncDetachedFromHub()
    }

    /** After server state_sync + optional localStorage merge, drop stale waiting flags. */
    reconcileLocalAfterServerSync() {
      var pendingList = (this.lastPendingSessionIds || []).map(function (id) {
        return { id: id, waiting: true }
      })
      for (var i = 0; i < pendingList.length; i++) {
        var sid = pendingList[i].id
        if (this.sessions[sid]) this.sessions[sid].waiting = true
      }
      this._reconcileWaitingWithServer(pendingList)
      this._syncDetachedFromHub()
      return [render('tabs', 'messages', 'pending', 'input', 'staged_images'), dom('save_state')]
    }

    _onSessionUpdated(msg) {
      var hubWs = this.hubSnapshot && this.hubSnapshot.workspaces
      if (msg.project_directory && !PanelState.sessionBelongsToPanel(this.panelWorkspace, msg.project_directory, hubWs)) {
        this.routingMismatch = {
          project: msg.project_directory,
          summary: (msg.summary || '').slice(0, 120),
        }
        return [
          notify({ type: 'routing-mismatch', project: msg.project_directory }),
          render('connection'),
          dom('save_state'),
        ]
      }
      this.routingMismatch = null

      var id = msg.session_id
      if (!id) return this._onSessionUpdatedLegacy(msg)

      var sess = this.ensureSession(id, msg.session_label, msg.summary, msg.trace_id, { markWaiting: true })
      if (msg.project_directory) sess.projectDirectory = msg.project_directory
      this._trackPendingSessionId(id)
      this.activeSessionId = id
      var sumText = msg.summary || ''
      var lastMsg = sess.messages.length ? sess.messages[sess.messages.length - 1] : null
      if (!lastMsg || lastMsg.role !== 'ai' || lastMsg.content !== sumText) {
        sess.messages.push({
          role: 'ai',
          content: sumText,
          timestamp: new Date().toISOString(),
        })
      }

      var cmds = [
        render('tabs', 'messages', 'pending', 'input', 'staged_images'),
        dom('save_state'),
        notify({ type: 'new-session', session_id: id }),
        notify({ type: 'feedback-arrived', session_id: id }),
      ]

      if (sess.pendingQueue.length > 0 || sess.pendingImages.length > 0) {
        var combined = sess.pendingQueue.join('\n\n')
        var images = sess.pendingImages.length > 0 ? sess.pendingImages.slice() : []
        sess.pendingQueue = []
        sess.pendingImages = []
        return {
          commands: cmds.concat([render('pending')]),
          autoSubmit: { session_id: id, text: combined || '(image)', images: images },
        }
      }

      var pendingAutoSubmit = this._drainGlobalPendingForAutoSubmit(id, cmds)
      if (pendingAutoSubmit) return pendingAutoSubmit

      if (this.autoReply && this.autoReplyText) {
        return {
          commands: cmds,
          autoReply: { session_id: id, text: this.autoReplyText, delay: 500 },
        }
      }

      return cmds
    }

    _drainGlobalPendingForAutoSubmit(id, cmds) {
      if (!id || !this.sessions[id] || !this._canSubmitToSession(this.sessions[id])) return null
      if (this.globalPendingQueue.length === 0 && this.globalPendingImages.length === 0) return null
      var combined = this.globalPendingQueue.join('\n\n')
      var images = this.globalPendingImages.length > 0 ? this.globalPendingImages.slice() : []
      this.globalPendingQueue = []
      this.globalPendingImages = []
      cmds.push(render('pending'))
      cmds.push(wsSend({ type: 'queue-pending', comments: [], images: [] }))
      return {
        commands: cmds,
        autoSubmit: { session_id: id, text: combined || '(image)', images: images },
      }
    }

    _onSessionUpdatedLegacy(msg) {
      var legacyId = 'legacy-' + Date.now().toString(36)
      return this._onSessionUpdated({
        type: 'session_updated',
        session_id: legacyId,
        session_label: '',
        summary: msg.summary || '',
      })
    }

    _onFeedbackSubmitted(msg) {
      var id = msg.session_id || this.activeSessionId
      if (!id || !this.sessions[id]) return [render('tabs', 'messages', 'input')]

      var sess = this.sessions[id]
      if (msg.feedback) {
        var last = sess.messages[sess.messages.length - 1]
        var alreadyHas = last && last.role === 'user' && last.content === msg.feedback
        if (!alreadyHas) {
          sess.messages.push({
            role: 'user',
            content: msg.feedback,
            timestamp: new Date().toISOString(),
          })
        }
      }
      sess.waiting = false
      sess.submitInFlight = false
      if (msg.feedback) {
        this._removeFromGlobalPending(msg.feedback)
      }
      return [render('tabs', 'messages', 'input', 'staged_images', 'pending'), dom('save_state')]
    }

    _onFeedbackUndelivered(msg) {
      var id = msg.session_id || this.activeSessionId
      if (!id || !this.sessions[id]) return []
      var sess = this.sessions[id]
      sess.mcpDetached = true
      sess.cursorEnded = true
      sess.waiting = true
      sess.submitInFlight = false
      if (msg.detail) sess.statusDetail = msg.detail
      return [
        notify({ type: 'agent-link-lost-queued', session_id: id, detail: sess.statusDetail }),
        render('tabs', 'messages', 'pending', 'input', 'staged_images'),
        dom('save_state'),
      ]
    }

    _onPendingDelivered(msg) {
      var id = this.activeSessionId
      if (!id || !this.sessions[id]) return []
      var sess = this.sessions[id]
      var comments = msg.comments || []
      var images = msg.images || []
      sess.messages.push({
        role: 'user',
        content: comments.join('\n\n') || '',
        timestamp: new Date().toISOString(),
        pending_delivered: true,
        images: images.length > 0 ? images : undefined,
      })
      sess.pendingQueue = []
      sess.pendingImages = []
      return [render('messages', 'pending'), dom('save_state')]
    }

    _onPendingSynced(msg) {
      this.globalPendingQueue = msg.comments || []
      if (msg.images !== undefined) this.globalPendingImages = msg.images
      return [render('pending'), dom('save_state')]
    }

    smartSend(text, images) {
      var hasImages = images && images.length > 0
      if (!hasImages && PanelState.isPingCommand(text)) {
        return [
          wsSend({ type: 'ping' }),
          dom('user_ping'),
          dom('clear_input'),
        ]
      }
      var active = this.getActiveSession()
      if (this._canSubmitToSession(active)) return this.submitFeedback(text, images)
      var live = this._latestSubmittableWaitingSessionId()
      if (live) {
        this.activeSessionId = live
        return [
          render('tabs', 'messages', 'pending', 'input', 'staged_images'),
          notify({ type: 'retarget-live-session', session_id: live }),
        ].concat(this.submitFeedback(text, images, { session_id: live }))
      }
      if (this.waitingCount > 0) {
        var latest = this._latestWaitingSessionId()
        if (latest) {
          this.activeSessionId = latest
          return [
            render('tabs', 'messages', 'pending', 'input', 'staged_images'),
          ].concat(this.submitFeedback(text, images, { session_id: latest }))
        }
      }
      return this.addToPending(text, images)
    }

    submitFeedback(text, images, opts) {
      var id = (opts && opts.session_id) || this.activeSessionId
      var sess = id ? this.sessions[id] : null
      if (!sess || !sess.waiting) return []
      if (sess.submitInFlight) return []

      var pendingParts = sess.pendingQueue.slice()
      var pendingImgs = sess.pendingImages.slice()
      sess.pendingQueue = []
      sess.pendingImages = []

      var mergedText = [pendingParts.join('\n\n'), text || ''].filter(function (p) { return p && p.trim() }).join('\n\n')
      var mergedImages = pendingImgs.concat(images && images.length > 0 ? images : [])

      sess.messages.push({
        role: 'user',
        content: mergedText || '',
        timestamp: new Date().toISOString(),
        images: mergedImages.length > 0 ? mergedImages : undefined,
      })

      if (sess.mcpDetached || this._sessionLinkLost(sess)) {
        if (mergedText && mergedText.trim()) {
          this.globalPendingQueue.push(mergedText.trim())
        }
        if (mergedImages.length > 0) {
          this.globalPendingImages = this.globalPendingImages.concat(mergedImages)
        }
        sess.waiting = false
        var detachedCmds = [
          wsSend({
            type: 'queue-pending',
            comments: this.globalPendingQueue.slice(),
            images: this.globalPendingImages.slice(),
          }),
          notify({ type: 'agent-link-lost-queued', session_id: id, detail: sess.statusDetail }),
          render('tabs', 'messages', 'pending', 'input', 'staged_images'),
        ]
        if (!opts || !opts.preserveInput) {
          sess.stagedImages = []
          sess.inputDraft = ''
          detachedCmds.push(dom('clear_input'))
          detachedCmds.push(dom('clear_staged_images'))
        }
        detachedCmds.push(dom('save_state'))
        return detachedCmds
      }

      var cmds = [
        wsSend({
          type: 'feedback_response',
          session_id: id,
          feedback: mergedText || '',
          images: mergedImages,
          ...(sess.projectDirectory ? { project_directory: sess.projectDirectory } : {}),
        }),
        render('tabs', 'messages', 'pending', 'input', 'staged_images'),
      ]
      sess.submitInFlight = true

      if (!opts || !opts.preserveInput) {
        sess.stagedImages = []
        sess.inputDraft = ''
        cmds.push(dom('clear_input'))
        cmds.push(dom('clear_staged_images'))
      }

      cmds.push(dom('save_state'))
      cmds.push(notify({ type: 'feedback-submitted', session_id: id }))
      return cmds
    }

    addToPending(text, images) {
      var hasText = text && text.trim()
      var hasImages = images && images.length > 0
      if (!hasText && !hasImages) return []

      var active = this.getActiveSession()
      if (hasText) this.globalPendingQueue.push(text.trim())
      if (hasImages) this.globalPendingImages = this.globalPendingImages.concat(images)
      if (active) {
        active.stagedImages = []
        active.inputDraft = ''
      }
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue.slice(),
          images: this.globalPendingImages.slice(),
        }),
        render('pending'),
        dom('clear_input'),
        dom('clear_staged_images'),
        dom('save_state'),
      ]
    }

    editPending(idx) {
      var q = this.globalPendingQueue
      if (idx < 0 || idx >= q.length) return []
      var text = q[idx]
      q.splice(idx, 1)
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue.slice(),
          images: this.globalPendingImages.slice(),
        }),
        render('pending'),
        dom('set_input', text),
        dom('focus_input'),
        dom('save_state'),
      ]
    }

    removePending(idx) {
      var q = this.globalPendingQueue
      if (idx < 0 || idx >= q.length) return []
      q.splice(idx, 1)
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue.slice(),
          images: this.globalPendingImages.slice(),
        }),
        render('pending'),
        dom('save_state'),
      ]
    }

    clearPending() {
      this.globalPendingQueue = []
      this.globalPendingImages = []
      return [
        wsSend({ type: 'queue-pending', comments: [], images: [] }),
        render('pending'),
        dom('save_state'),
      ]
    }

    clearPendingImages() {
      if (this.globalPendingImages.length === 0) return []
      this.globalPendingImages = []
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue.slice(),
          images: [],
        }),
        render('pending'),
        dom('save_state'),
      ]
    }

    stageImage(base64) {
      var active = this.getActiveSession()
      if (!active) return []
      active.stagedImages.push(base64)
      return [render('staged_images'), dom('update_send_button')]
    }

    unstageImage(idx) {
      var active = this.getActiveSession()
      if (!active || idx < 0 || idx >= active.stagedImages.length) return []
      active.stagedImages.splice(idx, 1)
      return [render('staged_images'), dom('update_send_button')]
    }

    getStagedImages() {
      var active = this.getActiveSession()
      return active ? active.stagedImages : []
    }

    getPendingDisplay() {
      return {
        comments: this.globalPendingQueue.slice(),
        images: this.globalPendingImages.slice(),
      }
    }

    setUxPrefs(prefs) {
      if (prefs.quickReplies) this.quickReplies = PanelState.normalizeQuickReplies(prefs.quickReplies)
      if (prefs.inputPaneHeight !== undefined) {
        this.inputPaneHeight = PanelState.clampInputPaneHeight(prefs.inputPaneHeight, prefs.viewportHeight || 600)
      }
      if (prefs.ctrlEnterSend !== undefined) this.ctrlEnterSend = !!prefs.ctrlEnterSend
      if (prefs.confirmFinished !== undefined) this.confirmFinished = !!prefs.confirmFinished
      return [dom('save_state'), dom('render_quick_replies'), dom('apply_pane_height')]
    }

    fillInputFromQuickReply(text) {
      return [
        dom('set_input', text || ''),
        dom('focus_input'),
        dom('save_state'),
      ]
    }

    setAutoReply(enabled, text) {
      this.autoReply = !!enabled
      if (text !== undefined) this.autoReplyText = text
      return [dom('save_state')]
    }

    getUIState() {
      var active = this.getActiveSession()
      var waiting = !!(active && active.waiting)
      var anyWaiting = this.waitingCount > 0
      var linkLost = !!(active && active.waiting && this._sessionLinkLost(active))
      var hasLiveTarget = !!this._latestSubmittableWaitingSessionId()
      var detachedOnlyWaiting = anyWaiting && !hasLiveTarget
      return {
        buttonMode: detachedOnlyWaiting ? 'queue_lost' : ((waiting || hasLiveTarget) ? 'send' : 'queue'),
        isWaiting: waiting || anyWaiting,
        linkLost: (linkLost || detachedOnlyWaiting) && !hasLiveTarget,
        submitInFlight: !!(active && active.submitInFlight),
        waitingCount: this.waitingCount,
        activeSessionId: this.activeSessionId,
      }
    }

    serialize() {
      return {
        sessions: this.sessions,
        sessionOrder: this.sessionOrder,
        activeSessionId: this.activeSessionId,
        globalPendingQueue: this.globalPendingQueue,
        globalPendingImages: this.globalPendingImages,
        autoReply: this.autoReply,
        autoReplyText: this.autoReplyText,
        quickReplies: this.quickReplies,
        inputPaneHeight: this.inputPaneHeight,
        ctrlEnterSend: this.ctrlEnterSend,
        confirmFinished: this.confirmFinished,
      }
    }

    deserialize(data) {
      if (!data) return
      this.sessions = data.sessions || {}
      this.sessionOrder = data.sessionOrder || []
      this.activeSessionId = data.activeSessionId || null
      this.globalPendingQueue = data.globalPendingQueue || []
      this.globalPendingImages = data.globalPendingImages || []
      this.autoReply = data.autoReply || false
      this.autoReplyText = data.autoReplyText || 'Continue'
      if (data.quickReplies) {
        this.quickReplies = PanelState.normalizeQuickReplies(data.quickReplies)
      }
      if (data.inputPaneHeight) {
        this.inputPaneHeight = PanelState.clampInputPaneHeight(data.inputPaneHeight, 600)
      }
      if (data.ctrlEnterSend !== undefined) this.ctrlEnterSend = !!data.ctrlEnterSend
      if (data.confirmFinished !== undefined) this.confirmFinished = !!data.confirmFinished
      // waiting flags are authoritative from server sync, not localStorage
      for (var i = 0; i < this.sessionOrder.length; i++) {
        var sid = this.sessionOrder[i]
        var sess = this.sessions[sid]
        if (sess) sess.waiting = false
      }
    }

    static md(text) {
      if (!text) return ''

      const codeBlocks = []

      const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      const inlineMd = (s) => {
        let t = escapeHtml(s)
        // GFM: `` `word` `` → literal `word` (allow spaces around inner backticks)
        t = t.replace(/``\s*(`([^`]+)`)\s*``/g, '&#96;$2&#96;')
        t = t.replace(/`([^`]+)`/g, (match, inner) => {
          const body = inner.trim()
          if (!body) return ''
          return `<code>${body}</code>`
        })
        t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        t = t.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
        return t
      }

      let src = String(text)
      src = src.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code) => {
        const trimmed = String(code).replace(/^\n+|\n+$/g, '')
        const idx = codeBlocks.length
        codeBlocks.push(`<pre><code>${escapeHtml(trimmed)}</code></pre>`)
        return `\x00CODE${idx}\x00`
      })

      const lines = src.split('\n')
      const out = []
      let listItems = []
      let paraLines = []

      const flushList = () => {
        if (!listItems.length) return
        out.push(`<ul>${listItems.map((li) => `<li>${inlineMd(li)}</li>`).join('')}</ul>`)
        listItems = []
      }

      const flushPara = () => {
        if (!paraLines.length) return
        out.push(`<p>${inlineMd(paraLines.join(' '))}</p>`)
        paraLines = []
      }

      const flushBlocks = () => {
        flushPara()
        flushList()
      }

      for (const rawLine of lines) {
        const line = rawLine.trim()
        const codeMatch = line.match(/^\x00CODE(\d+)\x00$/)
        if (codeMatch) {
          flushBlocks()
          out.push(codeBlocks[Number(codeMatch[1])])
          continue
        }
        if (line.includes('\x00CODE')) {
          flushBlocks()
          out.push(inlineMd(rawLine))
          continue
        }
        if (!line) {
          flushBlocks()
          continue
        }
        if (/^- (.+)$/.test(line)) {
          flushPara()
          listItems.push(line.replace(/^- /, ''))
          continue
        }
        flushList()
        if (/^### (.+)$/.test(line)) {
          flushPara()
          out.push(`<h4>${escapeHtml(line.slice(4))}</h4>`)
          continue
        }
        if (/^## (.+)$/.test(line)) {
          flushPara()
          out.push(`<h3>${escapeHtml(line.slice(3))}</h3>`)
          continue
        }
        if (/^# (.+)$/.test(line)) {
          flushPara()
          out.push(`<h2>${escapeHtml(line.slice(2))}</h2>`)
          continue
        }
        paraLines.push(line)
      }
      flushBlocks()

      return out.join('')
    }

    /** Convert rendered message HTML to plain text for clipboard (testable). */
    static htmlToPlainText(html) {
      if (!html) return ''
      return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li>/gi, '- ')
        .replace(/<\/ul>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/pre>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    /** Prefer markdown source; fall back to rendered HTML. */
    static plainCopyText(markdownSource, renderedHtml) {
      if (markdownSource) return markdownSource
      return PanelState.htmlToPlainText(renderedHtml)
    }

    static selectionCopyText(selected, raw, fullTextLen) {
      if (!selected) return raw || ''
      if (raw && fullTextLen > 0 && selected.length >= fullTextLen * 0.8) return raw
      return selected
    }

    /** Extract image files from ClipboardData; prefer items over files to avoid duplicates. */
    static extractClipboardImages(clipboardData) {
      var images = []
      if (!clipboardData) return images
      if (clipboardData.items) {
        for (var i = 0; i < clipboardData.items.length; i++) {
          var item = clipboardData.items[i]
          if (item.type && item.type.indexOf('image/') === 0) {
            var file = item.getAsFile && item.getAsFile()
            if (file) images.push(file)
          }
        }
      }
      if (images.length) return images
      if (clipboardData.files) {
        for (var j = 0; j < clipboardData.files.length; j++) {
          var f = clipboardData.files[j]
          if (f && f.type && f.type.indexOf('image/') === 0) images.push(f)
        }
      }
      return images
    }

    static shouldBlockDuplicatePaste(pending, pasteAt, now) {
      if (pending) return true
      if (pasteAt && now - pasteAt < 800) return true
      return false
    }

    static resolveWsUrl(currentUrl, serverPort) {
      if (!serverPort) return currentUrl
      var match = currentUrl.match(/^(ws:\/\/127\.0\.0\.1:)(\d+)(.*)$/)
      if (!match) return 'ws://127.0.0.1:' + serverPort
      var currentPort = parseInt(match[2], 10)
      if (currentPort === serverPort) return currentUrl
      return match[1] + serverPort + (match[3] || '')
    }

    static isValidWsUrl(url) {
      return /^ws:\/\/127\.0\.0\.1:\d+$/.test(url || '')
    }

    static healthPortRange() {
      return { start: 48200, end: 48300 }
    }

    static getAtQuery(text, cursorPos) {
      var before = text.slice(0, cursorPos)
      var match = before.match(/@([^\s@]*)$/)
      return match ? { query: match[1], start: match.index, end: cursorPos } : null
    }

    static isPingCommand(text) {
      return typeof text === 'string' && text.trim().toLowerCase() === PING_COMMAND
    }

    static tabTitle = tabTitle
  }

  markdownModule.attachPanelStateMarkdown(PanelState)
  uxModule.attachPanelStateUx(PanelState)

  PanelState.PING_COMMAND = PING_COMMAND
  PanelState.PONG_REPLY = PONG_REPLY
  PanelState.sessionBelongsToPanel = function (panelWorkspace, projectDirectory, hubWorkspaces) {
    if (!projectDirectory) return true
    var roots = (hubWorkspaces && hubWorkspaces.length)
      ? hubWorkspaces
      : (panelWorkspace ? [panelWorkspace] : [])
    if (!roots.length) return true
    for (var i = 0; i < roots.length; i++) {
      if (PanelState.projectPathMatches(roots[i], projectDirectory)) return true
    }
    return false
  }
  PanelState.projectPathMatches = function (entryPath, want) {
    if (!want || !entryPath) return !want
    var entry = String(entryPath).replace(/[\\/]+$/, '')
    var target = String(want).replace(/[\\/]+$/, '')
    if (entry === target) return true
    if (target.indexOf(entry + '/') === 0 || target.indexOf(entry + '\\') === 0) return true
    if (entry.indexOf(target + '/') === 0 || entry.indexOf(target + '\\') === 0) return true
    return false
  }
  PanelState.shouldDebounceReconnect = function (lastAt, now, windowMs) {
    windowMs = windowMs || 1200
    return lastAt > 0 && (now - lastAt) < windowMs
  }
  PanelState.tabProjectBadge = function (session) {
    if (!session || !session.projectDirectory) return ''
    var parts = String(session.projectDirectory).replace(/[\\/]+$/, '').split(/[/\\]/)
    return parts[parts.length - 1] || ''
  }
  PanelState.exportSessionsSnapshot = function (state) {
    return {
      exportedAt: new Date().toISOString(),
      panelWorkspace: state.panelWorkspace || '',
      sessions: state.sessionOrder.map(function (id) {
        var s = state.sessions[id]
        return {
          id: id,
          label: s.label,
          summary: s.summary,
          waiting: s.waiting,
          project_directory: s.projectDirectory || '',
          traceId: s.traceId || '',
          messages: s.messages,
        }
      }),
    }
  }
  PanelState.filterSessionsByQuery = function (state, query) {
    var q = String(query || '').trim().toLowerCase()
    if (!q) return state.sessionOrder.slice()
    return state.sessionOrder.filter(function (id) {
      var s = state.sessions[id]
      if (!s) return false
      var hay = [
        id, s.label, s.summary, s.projectDirectory,
      ].join(' ').toLowerCase()
      return hay.indexOf(q) >= 0
    })
  }
  PanelState.DEFAULT_QUICK_REPLIES = [
    { id: 'continue', label: 'Continue', text: 'Continue', icon: '\u25B6' },
    { id: 'looks-good', label: 'Looks Good', text: 'Looks good, proceed', icon: '\u2713' },
    { id: 'fix', label: 'Fix', text: 'Please fix the issues', icon: '\u26A1' },
    { id: 'pause', label: 'Pause', text: 'Stop, let me review first', icon: '\u25A0' },
    {
      id: 'test-verify',
      label: 'Test Verify',
      text: 'TDD 充分了吗，测试覆盖全了吗，单测，集成测试，覆盖测试，性能测试，etc？',
      icon: '\u2699',
    },
    { id: 'finished', label: 'Finished', text: 'Finished', icon: '', finished: true },
  ]
  PanelState.normalizeQuickReplies = function (custom) {
    var base = PanelState.DEFAULT_QUICK_REPLIES
    if (!custom || !custom.length) return base.map(function (q) { return Object.assign({}, q) })
    var byId = {}
    for (var i = 0; i < custom.length; i++) {
      var c = custom[i]
      if (c && c.id) byId[c.id] = c
    }
    return base.map(function (q) {
      var o = byId[q.id]
      if (!o) return Object.assign({}, q)
      return {
        id: q.id,
        label: o.label || q.label,
        text: o.text || q.text,
        icon: o.icon !== undefined ? o.icon : q.icon,
        finished: o.finished !== undefined ? !!o.finished : !!q.finished,
      }
    })
  }
  PanelState.parseQuickRepliesConfig = function (raw) {
    var lines = String(raw || '').split('\n')
    var out = []
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue
      var parts = line.split('|')
      if (parts.length < 2) continue
      out.push({
        id: 'custom-' + i,
        label: parts[0].trim(),
        text: parts.slice(1).join('|').trim(),
        icon: '',
        finished: parts[0].trim().toLowerCase() === 'finished'
          || parts.slice(1).join('|').trim().toLowerCase() === 'finished',
      })
    }
    return out.length ? out : null
  }
  PanelState.clampInputPaneHeight = function (h, viewportH) {
    var minH = 120
    var maxH = Math.max(minH, Math.floor((viewportH || 600) * 0.7))
    var n = Number(h)
    if (!Number.isFinite(n)) return 220
    return Math.min(maxH, Math.max(minH, Math.round(n)))
  }
  PanelState.parseStoredInputPaneHeight = function (raw, viewportH) {
    if (raw === null || raw === undefined || raw === '') return 220
    return PanelState.clampInputPaneHeight(raw, viewportH)
  }
  PanelState.shouldConfirmFinished = function (text, enabled) {
    if (!enabled) return false
    return String(text || '').trim().toLowerCase() === 'finished'
  }
  PanelState.shouldSubmitOnCtrlEnter = function (event, enabled) {
    if (!enabled || !event) return false
    if (event.key !== 'Enter') return false
    return !!(event.ctrlKey || event.metaKey)
  }
  PanelState.resolveQuickReplyMode = function (event) {
    return event && event.shiftKey ? 'fill' : 'send'
  }
  PanelState.versionSkewBannerText = function (warnings) {
    if (!warnings || !warnings.length) return ''
    return String(warnings[0])
  }
  PanelState.deployReloadBannerText = function (memoryVersion, diskVersion, deployStamp) {
    if (memoryVersion && diskVersion && memoryVersion !== diskVersion) {
      return 'Running ' + memoryVersion + ' — Reload Window to load ' + diskVersion + ' from disk'
    }
    if (!deployStamp || !memoryVersion) return ''
    if (deployStamp.version === memoryVersion) return ''
    return 'Deploy ' + deployStamp.version + ' on disk — Reload Window (running ' + memoryVersion + ')'
  }
  PanelState.exportAgentContinuationJson = function (state) {
    var snap = PanelState.exportSessionsSnapshot(state)
    return {
      purpose: 'agent_session_handoff',
      exportedAt: snap.exportedAt,
      panelWorkspace: snap.panelWorkspace,
      activeSessionId: state.activeSessionId || '',
      resumeHint: 'Feed sessions[].messages to the agent as prior context',
      sessions: snap.sessions.map(function (s) {
        return {
          id: s.id,
          label: s.label,
          traceId: s.traceId,
          project_directory: s.project_directory,
          waiting: s.waiting,
          summary: s.summary,
          messages: s.messages,
        }
      }),
    }
  }
  PanelState.debugSessionTraces = function (state) {
    return (state.sessionOrder || []).map(function (id) {
      var s = state.sessions[id]
      return { id: id, traceId: (s && s.traceId) || '' }
    }).filter(function (row) { return row.traceId })
  }
  PanelState.messagesScrolledUp = function (el, threshold) {
    if (!el) return false
    threshold = threshold || 40
    return (el.scrollHeight - el.scrollTop - el.clientHeight) > threshold
  }
  PanelState.cmd = { wsSend, render, dom, notify }
  exports.PanelState = PanelState
  exports.OutboundQueue = OutboundQueue
  exports.TransportMetrics = TransportMetrics
  exports.BridgeSessionGate = BridgeSessionGate
  exports.transportSendWithQueue = transportSendWithQueue
  exports.storageKeyForWorkspace = storageKeyForWorkspace


  PanelState.sessionsToMarkdown = function (state) {
    var lines = ['# MCP Feedback Sessions', '']
    var order = state.sessionOrder || []
    for (var i = 0; i < order.length; i++) {
      var sid = order[i]
      var sess = state.sessions[sid]
      if (!sess) continue
      lines.push('## ' + (sess.label || sid))
      if (sess.summary) lines.push('', '**Summary:** ' + sess.summary)
      if (sess.traceId) lines.push('**Trace:** `' + sess.traceId + '`')
      lines.push('')
      var msgs = sess.messages || []
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j]
        var who = m.role === 'user' ? 'User' : 'AI'
        lines.push('- **' + who + ':** ' + (m.content || m.text || ''))
      }
      lines.push('')
    }
    return lines.join('\n')
  }
  PanelState.autoGrowTextareaHeight = function (el, opts) {
    if (!el || !el.style) return
    var minPx = (opts && opts.minPx) || 48
    var maxPx = (opts && opts.maxPx) || 280
    el.style.height = '0px'
    var next = Math.min(maxPx, Math.max(minPx, el.scrollHeight || minPx))
    el.style.height = next + 'px'
  }
  PanelState.buildHealthSignature = function (health, extras) {
    return JSON.stringify({
      level: health && health.level,
      label: health && health.label,
      detail: health && health.detail,
      portPid: health && health.portPid,
      issues: health && health.issues,
      extras: extras || {},
    })
  }
  PanelState.shouldSkipHealthRender = function (prev, next) {
    return !!prev && prev === next
  }
  PanelState.formatConnectionStatusLabel = function (level, pid) {
    var base = level === 'ok' ? 'Connected' : (level === 'degraded' ? 'Degraded' : 'Disconnected')
    return pid ? (base + ' pid=' + pid) : base
  }
  exports.ConnectionHealth = ConnectionHealth
})(typeof window !== 'undefined'
  ? (window.PanelStateModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
