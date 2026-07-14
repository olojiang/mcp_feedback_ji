/**
 * PanelState UX / quick-reply / banner static helpers.
 */
(function (exports) {
  'use strict'

  var DEFAULT_QUICK_REPLIES = [
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

  function normalizeQuickReplies(custom) {
    var base = DEFAULT_QUICK_REPLIES
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

  function parseQuickRepliesConfig(raw) {
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

  function deployReloadBannerText(memoryVersion, diskVersion, deployStamp) {
    if (memoryVersion && diskVersion && memoryVersion !== diskVersion) {
      return 'Running ' + memoryVersion + ' — Reload Window to load ' + diskVersion + ' from disk'
    }
    if (!deployStamp || !memoryVersion) return ''
    if (deployStamp.version === memoryVersion) return ''
    return 'Deploy ' + deployStamp.version + ' on disk — Reload Window (running ' + memoryVersion + ')'
  }

  function clampInputPaneHeight(h, viewportH) {
    var minH = 120
    var maxH = Math.max(minH, Math.floor((viewportH || 600) * 0.7))
    var n = Number(h)
    if (!Number.isFinite(n)) return 220
    return Math.min(maxH, Math.max(minH, Math.round(n)))
  }

  function parseStoredInputPaneHeight(raw, viewportH) {
    if (raw === null || raw === undefined || raw === '') return 220
    return clampInputPaneHeight(raw, viewportH)
  }

  function shouldConfirmFinished(text, enabled) {
    if (!enabled) return false
    return String(text || '').trim().toLowerCase() === 'finished'
  }

  function shouldSubmitOnCtrlEnter(event, enabled) {
    if (!enabled || !event) return false
    if (event.key !== 'Enter') return false
    return !!(event.ctrlKey || event.metaKey)
  }

  function resolveQuickReplyMode(event) {
    return event && event.shiftKey ? 'fill' : 'send'
  }

  function versionSkewBannerText(warnings) {
    if (!warnings || !warnings.length) return ''
    return String(warnings[0])
  }

  function messagesScrolledUp(el, threshold) {
    if (!el) return false
    threshold = threshold || 40
    return (el.scrollHeight - el.scrollTop - el.clientHeight) > threshold
  }

  function attachPanelStateUx(PanelState) {
    PanelState.DEFAULT_QUICK_REPLIES = DEFAULT_QUICK_REPLIES
    PanelState.normalizeQuickReplies = normalizeQuickReplies
    PanelState.parseQuickRepliesConfig = parseQuickRepliesConfig
    PanelState.deployReloadBannerText = deployReloadBannerText
    PanelState.clampInputPaneHeight = clampInputPaneHeight
    PanelState.parseStoredInputPaneHeight = parseStoredInputPaneHeight
    PanelState.shouldConfirmFinished = shouldConfirmFinished
    PanelState.shouldSubmitOnCtrlEnter = shouldSubmitOnCtrlEnter
    PanelState.resolveQuickReplyMode = resolveQuickReplyMode
    PanelState.versionSkewBannerText = versionSkewBannerText
    PanelState.messagesScrolledUp = messagesScrolledUp
  }

  exports.DEFAULT_QUICK_REPLIES = DEFAULT_QUICK_REPLIES
  exports.normalizeQuickReplies = normalizeQuickReplies
  exports.parseQuickRepliesConfig = parseQuickRepliesConfig
  exports.deployReloadBannerText = deployReloadBannerText
  exports.clampInputPaneHeight = clampInputPaneHeight
  exports.parseStoredInputPaneHeight = parseStoredInputPaneHeight
  exports.shouldConfirmFinished = shouldConfirmFinished
  exports.shouldSubmitOnCtrlEnter = shouldSubmitOnCtrlEnter
  exports.resolveQuickReplyMode = resolveQuickReplyMode
  exports.versionSkewBannerText = versionSkewBannerText
  exports.messagesScrolledUp = messagesScrolledUp
  exports.attachPanelStateUx = attachPanelStateUx
})(typeof window !== 'undefined'
  ? (window.PanelStateUxModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
