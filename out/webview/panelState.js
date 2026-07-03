/**
 * Multi-session PanelState — testable, no DOM/WebSocket side effects.
 */
(function (exports) {
  'use strict'

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
      this.lastPendingSessionIds = []
      this.panelWorkspace = ''
      this.routingMismatch = null
      this.quickReplies = PanelState.DEFAULT_QUICK_REPLIES.map(function (q) {
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

    ensureSession(id, label, summary, traceId) {
      if (!id) return null
      if (!this.sessions[id]) {
        this.sessions[id] = createSession(id, label, summary, traceId)
        this.sessionOrder.push(id)
      } else {
        if (label) this.sessions[id].label = label
        if (summary) this.sessions[id].summary = summary
        if (traceId) this.sessions[id].traceId = traceId
        this.sessions[id].waiting = true
      }
      return this.sessions[id]
    }

    setActiveSession(id) {
      if (!id || !this.sessions[id]) return []
      this.activeSessionId = id
      var s = this.sessions[id]
      return [render('tabs', 'messages', 'pending', 'input'), dom('set_input', s.inputDraft || '')]
    }

    _afterSessionListChange() {
      var active = this.getActiveSession()
      return [
        render('tabs', 'messages', 'pending', 'input'),
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

    closeSession(id) {
      if (!id || !this.sessions[id]) return []
      delete this.sessions[id]
      var idx = this.sessionOrder.indexOf(id)
      if (idx >= 0) this.sessionOrder.splice(idx, 1)
      this._adoptActiveIfNeeded([id])
      return this._afterSessionListChange()
    }

    closeOtherSessions(id) {
      if (!id || !this.sessions[id]) return []
      var keep = this.sessions[id]
      this.sessions = {}
      this.sessions[id] = keep
      this.sessionOrder = [id]
      this.activeSessionId = id
      return this._afterSessionListChange()
    }

    closeSessionsToLeft(id) {
      if (!id || !this.sessions[id]) return []
      var idx = this.sessionOrder.indexOf(id)
      if (idx <= 0) return []
      var removed = this.sessionOrder.slice(0, idx)
      for (var i = 0; i < removed.length; i++) delete this.sessions[removed[i]]
      this.sessionOrder = this.sessionOrder.slice(idx)
      this._adoptActiveIfNeeded(removed)
      return this._afterSessionListChange()
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
        case 'pending_delivered':
          return this._onPendingDelivered(msg)
        case 'pending_synced':
          return this._onPendingSynced(msg)
        case 'pong':
        case 'status_update':
          return []
        default:
          return []
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

    _onStateSync(msg) {
      var pending = msg.pending_sessions || []
      var hubWs = (msg.hub && msg.hub.workspaces) || (this.hubSnapshot && this.hubSnapshot.workspaces)
      var acceptedPending = []
      var latestPendingId = null
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i]
        var projectDir = p.project_directory || p.projectDir
        if (projectDir && !PanelState.sessionBelongsToPanel(this.panelWorkspace, projectDir, hubWs)) {
          continue
        }
        acceptedPending.push(p)
        this.ensureSession(p.id, p.label, p.summary, p.trace_id || p.traceId)
        latestPendingId = p.id || latestPendingId
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
      if (latestPendingId && this.sessions[latestPendingId] && this.sessions[latestPendingId].waiting) {
        this.activeSessionId = latestPendingId
      } else if (!this.activeSessionId && this.sessionOrder.length > 0) {
        this.activeSessionId = this.sessionOrder[this.sessionOrder.length - 1]
      }
      this.globalPendingQueue = msg.pending_comments || []
      this.globalPendingImages = msg.pending_images || []
      this.hubSnapshot = msg.hub || null
      this.lastPendingSessionIds = acceptedPending.map(function (p) { return p.id })
      return [render('tabs', 'messages', 'pending', 'input'), dom('save_state')]
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

      var sess = this.ensureSession(id, msg.session_label, msg.summary, msg.trace_id)
      if (msg.project_directory) sess.projectDirectory = msg.project_directory
      this.activeSessionId = id
      sess.messages.push({
        role: 'ai',
        content: msg.summary || '',
        timestamp: new Date().toISOString(),
      })

      var cmds = [
        render('tabs', 'messages', 'pending', 'input'),
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

      if (this.globalPendingQueue.length > 0 || this.globalPendingImages.length > 0) {
        var gCombined = this.globalPendingQueue.join('\n\n')
        var gImages =
          this.globalPendingImages.length > 0 ? this.globalPendingImages.slice() : []
        this.globalPendingQueue = []
        this.globalPendingImages = []
        cmds.push(render('pending'))
        cmds.push(wsSend({ type: 'queue-pending', comments: [], images: [] }))
        return {
          commands: cmds,
          autoSubmit: { session_id: id, text: gCombined || '(image)', images: gImages },
        }
      }

      if (this.autoReply && this.autoReplyText) {
        return {
          commands: cmds,
          autoReply: { session_id: id, text: this.autoReplyText, delay: 500 },
        }
      }

      return cmds
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
      return [render('tabs', 'messages', 'input'), dom('save_state')]
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
      if (active && active.waiting) return this.submitFeedback(text, images)
      if (this.waitingCount > 0) {
        var latest = this._latestWaitingSessionId()
        if (latest) {
          this.activeSessionId = latest
          return [
            render('tabs', 'messages', 'pending', 'input'),
          ].concat(this.submitFeedback(text, images, { session_id: latest }))
        }
      }
      return this.addToPending(text, images)
    }

    submitFeedback(text, images, opts) {
      var id = (opts && opts.session_id) || this.activeSessionId
      var sess = id ? this.sessions[id] : null
      if (!sess || !sess.waiting) return []

      sess.messages.push({
        role: 'user',
        content: text || '',
        timestamp: new Date().toISOString(),
        images: images && images.length > 0 ? images : undefined,
      })
      sess.waiting = false

      var cmds = [
        wsSend({
          type: 'feedback_response',
          session_id: id,
          feedback: text || '',
          images: images || [],
          ...(sess.projectDirectory ? { project_directory: sess.projectDirectory } : {}),
        }),
        render('tabs', 'messages', 'input'),
      ]

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
      if (active && active.waiting) {
        if (hasText) active.pendingQueue.push(text.trim())
        if (hasImages) active.pendingImages = active.pendingImages.concat(images)
      } else {
        if (hasText) this.globalPendingQueue.push(text.trim())
        if (hasImages) this.globalPendingImages = this.globalPendingImages.concat(images)
        return [
          wsSend({
            type: 'queue-pending',
            comments: this.globalPendingQueue,
            images: this.globalPendingImages,
          }),
          render('pending'),
          dom('clear_input'),
          dom('clear_staged_images'),
          dom('save_state'),
        ]
      }

      active.stagedImages = []
      active.inputDraft = ''
      return [
        render('pending'),
        dom('clear_input'),
        dom('clear_staged_images'),
        dom('save_state'),
      ]
    }

    editPending(idx) {
      var active = this.getActiveSession()
      var q = active && active.waiting ? active.pendingQueue : this.globalPendingQueue
      if (idx < 0 || idx >= q.length) return []
      var text = q[idx]
      q.splice(idx, 1)
      if (active && active.waiting) {
        return [render('pending'), dom('set_input', text), dom('focus_input'), dom('save_state')]
      }
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue,
          images: this.globalPendingImages,
        }),
        render('pending'),
        dom('set_input', text),
        dom('focus_input'),
        dom('save_state'),
      ]
    }

    removePending(idx) {
      var active = this.getActiveSession()
      var q = active && active.waiting ? active.pendingQueue : this.globalPendingQueue
      if (idx < 0 || idx >= q.length) return []
      q.splice(idx, 1)
      if (active && active.waiting) {
        return [render('pending'), dom('save_state')]
      }
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue,
          images: this.globalPendingImages,
        }),
        render('pending'),
        dom('save_state'),
      ]
    }

    clearPending() {
      var active = this.getActiveSession()
      if (active && active.waiting) {
        active.pendingQueue = []
        active.pendingImages = []
        return [render('pending'), dom('save_state')]
      }
      this.globalPendingQueue = []
      this.globalPendingImages = []
      return [
        wsSend({ type: 'queue-pending', comments: [], images: [] }),
        render('pending'),
        dom('save_state'),
      ]
    }

    clearPendingImages() {
      var active = this.getActiveSession()
      if (active && active.waiting) {
        if (active.pendingImages.length === 0) return []
        active.pendingImages = []
        return [render('pending'), dom('save_state')]
      }
      if (this.globalPendingImages.length === 0) return []
      this.globalPendingImages = []
      return [
        wsSend({
          type: 'queue-pending',
          comments: this.globalPendingQueue,
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
      return {
        buttonMode: waiting ? 'send' : 'queue',
        isWaiting: waiting,
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

  class OutboundQueue {
    constructor(limit) {
      this.limit = typeof limit === 'number' && limit > 0 ? limit : 32
      this.items = []
    }

    enqueue(message) {
      if (!message || typeof message !== 'object') return 0
      if (this.items.length >= this.limit) this.items.shift()
      this.items.push(message)
      return this.items.length
    }

    drain() {
      var items = this.items.slice()
      this.items = []
      return items
    }

    hasFeedbackResponse() {
      for (var i = 0; i < this.items.length; i++) {
        if (this.items[i] && this.items[i].type === 'feedback_response') return true
      }
      return false
    }

    get size() {
      return this.items.length
    }
  }

  class BridgeSessionGate {
    constructor() {
      this.ready = false
      this.registered = false
      this.initialized = false
    }

    resetForReconnect() {
      this.ready = false
      this.registered = false
      this.initialized = false
    }

    isReady() {
      return this.ready
    }

    onBridgeConnected() {
      this.ready = true
      if (this.initialized) {
        return { register: false, stateSync: false, labels: true }
      }
      this.initialized = true
      var register = !this.registered
      if (register) this.registered = true
      return { register: register, stateSync: true, labels: true }
    }

    shouldInitFromConnectionEstablished() {
      return !this.initialized
    }

    shouldInitFromServerInfo() {
      return !this.initialized
    }

    snapshot() {
      return {
        ready: this.ready,
        registered: this.registered,
        initialized: this.initialized,
      }
    }
  }

  function transportSendWithQueue(message, readyFn, sendFn, queueFn) {
    if (readyFn()) {
      sendFn(message)
      return true
    }
    queueFn(message)
    return false
  }

  class ConnectionHealth {
    static countStaleLocalWaiting(sessions, sessionOrder, pendingSessions) {
      var pendingIds = {}
      for (var i = 0; i < (pendingSessions || []).length; i++) {
        var p = pendingSessions[i]
        if (p && p.id) pendingIds[p.id] = true
      }
      var stale = 0
      for (var j = 0; j < (sessionOrder || []).length; j++) {
        var sid = sessionOrder[j]
        var sess = sessions[sid]
        if (sess && sess.waiting && !pendingIds[sid]) stale++
      }
      return stale
    }

    static workspaceLabel(workspaces) {
      if (!workspaces || !workspaces.length) return ''
      var p = workspaces[0]
      var parts = String(p).split(/[/\\]/)
      return parts[parts.length - 1] || p
    }

    static formatAgentLink(mcpServers, pendingCount, mcpDetached) {
      if (mcpDetached > 0) return 'Agent: waiting (link lost)'
      if (mcpServers > 0) {
        return mcpServers === 1 ? 'Agent: live' : ('Agent: live×' + mcpServers)
      }
      if (pendingCount > 0) return 'Agent: offline'
      return 'Agent: idle'
    }

    static evaluate(opts) {
      var issues = []
      var bridgeReady = !!opts.bridgeReady
      var hub = opts.hub || null
      var mcpServers = hub ? hub.mcp_servers : 0
      var pendingCount = hub ? hub.pending_count : (opts.pendingCount || 0)
      var mcpDetached = hub ? hub.mcp_detached_count : 0
      var staleLocal = opts.staleLocalWaiting || 0

      if (!bridgeReady) issues.push('Bridge not connected')
      if (opts.pingStale) issues.push('Hub ping timeout')
      if (opts.hubPidMismatch) issues.push('Hub restarted (pid changed)')
      if (mcpDetached > 0) {
        issues.push(mcpDetached + ' pending: Agent disconnected')
      }
      if (pendingCount > 0 && mcpServers === 0) {
        issues.push('No MCP server connected to this workspace hub')
      }
      if (staleLocal > 0) {
        issues.push(staleLocal + ' local tab(s) not on server queue')
      }
      var localWaiting = typeof opts.localWaitingCount === 'number' ? opts.localWaitingCount : null
      if (localWaiting !== null && pendingCount > 0 && localWaiting < pendingCount) {
        issues.push('UI missing ' + (pendingCount - localWaiting) + ' waiting tab(s) — click Reconnect')
      }
      if (opts.routingMismatchProject) {
        issues.push('Feedback routed to other workspace: ' + opts.routingMismatchProject)
      }

      var level = 'disconnected'
      if (bridgeReady) {
        level = issues.length ? 'degraded' : 'ok'
      }

      var wsLabel = ConnectionHealth.workspaceLabel(hub && hub.workspaces)
      var detailParts = []
      if (wsLabel) detailParts.push('WS:' + wsLabel)
      detailParts.push(ConnectionHealth.formatAgentLink(
        mcpServers, pendingCount, mcpDetached
      ))
      if (pendingCount > 0) detailParts.push('Pending:' + pendingCount)
      if (mcpDetached > 0) detailParts.push('Detached:' + mcpDetached)

      var label = level === 'ok' ? 'Connected' : (level === 'degraded' ? 'Degraded' : 'Disconnected')
      var portPid = hub && hub.pid ? (' pid=' + hub.pid) : ''

      return {
        level: level,
        label: label,
        detail: detailParts.join(' | '),
        portPid: portPid,
        issues: issues,
        workspace: wsLabel,
      }
    }
  }

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
  exports.BridgeSessionGate = BridgeSessionGate
  exports.transportSendWithQueue = transportSendWithQueue


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
