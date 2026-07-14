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
  var sessionsViewModule = loadModule('panelStateSessionsView', 'PanelStateSessionsViewModule')
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
  if (!sessionsViewModule) {
    sessionsViewModule = { attachPanelStateSessionsView: function () {} }
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
      pathReferences: [],
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
      this.globalStagedImages = []
      this.globalPathReferences = []
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

    getPathReferences() {
      var active = this.getActiveSession()
      var refs = active ? active.pathReferences : this.globalPathReferences
      return PanelState.normalizePathReferences(refs)
    }

    addPathReferences(references) {
      var active = this.getActiveSession()
      var current = active ? active.pathReferences : this.globalPathReferences
      var next = PanelState.normalizePathReferences((current || []).concat(references || []))
      if (active) active.pathReferences = next
      else this.globalPathReferences = next
      return [render('path_references', 'input'), dom('save_state')]
    }

    removePathReference(referencePath) {
      var active = this.getActiveSession()
      var current = active ? active.pathReferences : this.globalPathReferences
      var next = PanelState.normalizePathReferences(current).filter(function (ref) {
        return ref.path !== referencePath
      })
      if (active) active.pathReferences = next
      else this.globalPathReferences = next
      return [render('path_references', 'input'), dom('save_state')]
    }

    _clearPathReferencesForOwner(sessionId) {
      if (sessionId && this.sessions[sessionId]) this.sessions[sessionId].pathReferences = []
      else if (!sessionId) this.globalPathReferences = []
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
      var activeDraft = null
      var activeSess = this.getActiveSession()
      if (activeSess && !activeSess.waiting) {
        activeDraft = activeSess.inputDraft || ''
      }
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
      if (activeDraft && this.activeSessionId) {
        var newActive = this.sessions[this.activeSessionId]
        if (newActive && !(newActive.inputDraft && newActive.inputDraft.trim())) {
          newActive.inputDraft = activeDraft
        }
      }
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

    smartSend(text, images, pathReferences) {
      var sourceSessionId = this.activeSessionId
      var references = PanelState.normalizePathReferences(
        pathReferences === undefined ? this.getPathReferences() : pathReferences
      )
      var composedText = PanelState.composeFeedbackWithPathReferences(text, references)
      var hasImages = images && images.length > 0
      if (!hasImages && references.length === 0 && PanelState.isPingCommand(composedText)) {
        return [
          wsSend({ type: 'ping' }),
          dom('user_ping'),
          dom('clear_input'),
        ]
      }
      var result
      var active = this.getActiveSession()
      if (this._canSubmitToSession(active)) result = this.submitFeedback(composedText, images)
      var live = this._latestSubmittableWaitingSessionId()
      if (!result && live) {
        this.activeSessionId = live
        result = [
          render('tabs', 'messages', 'pending', 'input', 'staged_images'),
          notify({ type: 'retarget-live-session', session_id: live }),
        ].concat(this.submitFeedback(composedText, images, { session_id: live }))
      }
      if (!result && this.waitingCount > 0) {
        var latest = this._latestWaitingSessionId()
        if (latest) {
          this.activeSessionId = latest
          result = [
            render('tabs', 'messages', 'pending', 'input', 'staged_images'),
          ].concat(this.submitFeedback(composedText, images, { session_id: latest }))
        }
      }
      if (!result) result = this.addToPending(composedText, images)
      if (references.length > 0 && result && result.length > 0) {
        this._clearPathReferencesForOwner(sourceSessionId)
        result.push(render('path_references', 'input'))
      }
      return result
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
      } else {
        this.globalStagedImages = []
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
      if (active) active.stagedImages.push(base64)
      else this.globalStagedImages.push(base64)
      return [render('staged_images'), dom('update_send_button')]
    }

    unstageImage(idx) {
      var active = this.getActiveSession()
      var staged = active ? active.stagedImages : this.globalStagedImages
      if (!staged || idx < 0 || idx >= staged.length) return []
      staged.splice(idx, 1)
      return [render('staged_images'), dom('update_send_button')]
    }

    getStagedImages() {
      var active = this.getActiveSession()
      return active ? active.stagedImages : this.globalStagedImages
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
        globalStagedImages: this.globalStagedImages,
        globalPathReferences: this.globalPathReferences,
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
      this.globalStagedImages = data.globalStagedImages || []
      this.globalPathReferences = PanelState.normalizePathReferences(data.globalPathReferences)
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
        if (sess) {
          sess.waiting = false
          sess.pathReferences = PanelState.normalizePathReferences(sess.pathReferences)
        }
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

    static pendingDisplayCount(pending) {
      var comments = (pending && pending.comments) || []
      var images = (pending && pending.images) || []
      if (comments.length > 0) return comments.length
      return images.length > 0 ? 1 : 0
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

    static normalizePathReferences(references) {
      var result = []
      var seen = {}
      var list = Array.isArray(references) ? references : []
      for (var i = 0; i < list.length; i++) {
        var item = list[i]
        var rawPath = typeof item === 'string' ? item : (item && item.path)
        var referencePath = String(rawPath || '').trim()
        if (!referencePath || seen[referencePath]) continue
        seen[referencePath] = true
        var requestedKind = item && typeof item === 'object' ? item.kind : ''
        result.push({
          path: referencePath,
          kind: requestedKind === 'folder' || /\/$/.test(referencePath) ? 'folder' : 'file',
        })
      }
      return result
    }

    static composeFeedbackWithPathReferences(text, references) {
      var body = String(text || '').trim()
      var refs = PanelState.normalizePathReferences(references).map(function (reference) {
        return '@' + reference.path
      })
      return [body, refs.join('\n')].filter(Boolean).join('\n\n')
    }

    static isPingCommand(text) {
      return typeof text === 'string' && text.trim().toLowerCase() === PING_COMMAND
    }

    static tabTitle = tabTitle
  }

  markdownModule.attachPanelStateMarkdown(PanelState)
  uxModule.attachPanelStateUx(PanelState)
  sessionsViewModule.attachPanelStateSessionsView(PanelState)

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
  PanelState.relativeFilePath = function (filePath, workspaceRoot) {
    if (!filePath) return ''
    var p = String(filePath)
    if (!workspaceRoot) return p
    var root = String(workspaceRoot).replace(/\/+$/, '').replace(/\\+$/, '')
    if (!root) return p
    var normP = p.replace(/\\/g, '/')
    var normRoot = root.replace(/\\/g, '/')
    if (normP === normRoot) return ''
    if (normP.indexOf(normRoot + '/') === 0) {
      return normP.slice(normRoot.length + 1)
    }
    return p
  }
  PanelState.pathFromFileUri = function (uri) {
    if (!uri) return ''
    var s = String(uri).trim()
    if (s.indexOf('file://') !== 0) return s
    s = s.slice(7)
    if (s.length >= 3 && s.charAt(0) === '/' && s.charAt(2) === ':') {
      s = s.slice(1)
    }
    try { return decodeURIComponent(s) } catch (e) { return s }
  }
  PanelState.finishedClickAction = function (confirmEnabled, pendingConfirm) {
    if (!confirmEnabled) return 'send'
    return pendingConfirm ? 'send' : 'confirm-first'
  }
  PanelState.addPathsToLru = function (list, paths, max) {
    var result = Array.isArray(list) ? list.slice() : []
    var arr = Array.isArray(paths) ? paths : []
    for (var i = 0; i < arr.length; i++) {
      var p = String(arr[i] || '')
      if (!p) continue
      var idx = result.indexOf(p)
      if (idx >= 0) result.splice(idx, 1)
      result.unshift(p)
    }
    if (typeof max === 'number' && max > 0 && result.length > max) {
      result = result.slice(0, max)
    }
    return result
  }
  PanelState.removeFromPathLru = function (list, path) {
    if (!Array.isArray(list)) return []
    var idx = list.indexOf(path)
    if (idx < 0) return list.slice()
    var result = list.slice()
    result.splice(idx, 1)
    return result
  }
  exports.ConnectionHealth = ConnectionHealth
})(typeof window !== 'undefined'
  ? (window.PanelStateModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
