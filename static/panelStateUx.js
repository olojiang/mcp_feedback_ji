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

  function attachPanelStateUx(PanelState) {
    PanelState.DEFAULT_QUICK_REPLIES = DEFAULT_QUICK_REPLIES
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
    PanelState.deployReloadBannerText = function (memoryVersion, diskVersion, deployStamp) {
      if (memoryVersion && diskVersion && memoryVersion !== diskVersion) {
        return 'Running ' + memoryVersion + ' — Reload Window to load ' + diskVersion + ' from disk'
      }
      if (!deployStamp || !memoryVersion) return ''
      if (deployStamp.version === memoryVersion) return ''
      return 'Deploy ' + deployStamp.version + ' on disk — Reload Window (running ' + memoryVersion + ')'
    }
    PanelState.clampInputPaneHeight = function (h, viewportH) {
      var minH = 120
      var maxH = Math.max(minH, Math.floor((viewportH || 600) * 0.7))
      var n = Number(h)
      if (!Number.isFinite(n)) return 220
      return Math.min(maxH, Math.max(minH, Math.round(n)))
    }
    PanelState.shouldConfirmFinished = function (text, enabled) {
      if (!enabled) return false
      return String(text || '').trim().toLowerCase() === 'finished'
    }
  }

  exports.DEFAULT_QUICK_REPLIES = DEFAULT_QUICK_REPLIES
  exports.attachPanelStateUx = attachPanelStateUx
})(typeof window !== 'undefined'
  ? (window.PanelStateUxModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
