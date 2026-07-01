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

  function createSession(id, label, summary) {
    return {
      id: id,
      label: label || '',
      summary: summary || '',
      messages: [],
      pendingQueue: [],
      pendingImages: [],
      inputDraft: '',
      stagedImages: [],
      waiting: true,
      createdAt: Date.now(),
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
    }

    getActiveSession() {
      if (!this.activeSessionId) return null
      return this.sessions[this.activeSessionId] || null
    }

    ensureSession(id, label, summary) {
      if (!id) return null
      if (!this.sessions[id]) {
        this.sessions[id] = createSession(id, label, summary)
        this.sessionOrder.push(id)
      } else {
        if (label) this.sessions[id].label = label
        if (summary) this.sessions[id].summary = summary
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

    _onStateSync(msg) {
      var pending = msg.pending_sessions || []
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i]
        this.ensureSession(p.id, p.label, p.summary)
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
      if (!this.activeSessionId && this.sessionOrder.length > 0) {
        this.activeSessionId = this.sessionOrder[this.sessionOrder.length - 1]
      }
      this.globalPendingQueue = msg.pending_comments || []
      this.globalPendingImages = msg.pending_images || []
      return [render('tabs', 'messages', 'pending', 'input'), dom('save_state')]
    }

    _onSessionUpdated(msg) {
      var id = msg.session_id
      if (!id) return this._onSessionUpdatedLegacy(msg)

      var sess = this.ensureSession(id, msg.session_label, msg.summary)
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
      var active = this.getActiveSession()
      if (active && active.waiting) return this.submitFeedback(text, images)
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
    }

    static md(text) {
      if (!text) return ''
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/^- (.+)$/gm, '\u2022 $1<br>')
        .replace(/\n/g, '<br>')
    }

    /** Convert rendered message HTML to plain text for clipboard (testable). */
    static htmlToPlainText(html) {
      if (!html) return ''
      return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<\/pre>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\u2022 /g, '- ')
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

    static getAtQuery(text, cursorPos) {
      var before = text.slice(0, cursorPos)
      var match = before.match(/@([^\s@]*)$/)
      return match ? { query: match[1], start: match.index, end: cursorPos } : null
    }

    static tabTitle = tabTitle
  }

  PanelState.cmd = { wsSend, render, dom, notify }
  exports.PanelState = PanelState
})(typeof module !== 'undefined' ? module.exports : (window.PanelStateModule = {}))
