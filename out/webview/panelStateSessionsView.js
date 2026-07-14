/**
 * Read-only session presentation and export helpers for PanelState.
 */
(function (exports) {
  'use strict'

  function tabProjectBadge(session) {
    if (!session || !session.projectDirectory) return ''
    var parts = String(session.projectDirectory).replace(/[\\/]+$/, '').split(/[/\\]/)
    return parts[parts.length - 1] || ''
  }

  function exportSessionsSnapshot(state) {
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

  function filterSessionsByQuery(state, query) {
    var q = String(query || '').trim().toLowerCase()
    if (!q) return state.sessionOrder.slice()
    return state.sessionOrder.filter(function (id) {
      var s = state.sessions[id]
      if (!s) return false
      var hay = [id, s.label, s.summary, s.projectDirectory].join(' ').toLowerCase()
      return hay.indexOf(q) >= 0
    })
  }

  function exportAgentContinuationJson(state) {
    var snap = exportSessionsSnapshot(state)
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

  function debugSessionTraces(state) {
    return (state.sessionOrder || []).map(function (id) {
      var s = state.sessions[id]
      return { id: id, traceId: (s && s.traceId) || '' }
    }).filter(function (row) { return row.traceId })
  }

  function attachPanelStateSessionsView(PanelState) {
    PanelState.tabProjectBadge = tabProjectBadge
    PanelState.exportSessionsSnapshot = exportSessionsSnapshot
    PanelState.filterSessionsByQuery = filterSessionsByQuery
    PanelState.exportAgentContinuationJson = exportAgentContinuationJson
    PanelState.debugSessionTraces = debugSessionTraces
  }

  exports.tabProjectBadge = tabProjectBadge
  exports.exportSessionsSnapshot = exportSessionsSnapshot
  exports.filterSessionsByQuery = filterSessionsByQuery
  exports.exportAgentContinuationJson = exportAgentContinuationJson
  exports.debugSessionTraces = debugSessionTraces
  exports.attachPanelStateSessionsView = attachPanelStateSessionsView
})(typeof window !== 'undefined'
  ? (window.PanelStateSessionsViewModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
