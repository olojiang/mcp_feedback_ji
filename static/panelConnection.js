/**
 * Panel connection health rendering (extracted from panel.html).
 */
(function (exports) {
  'use strict'

  function createConnectionRenderer(ctx) {
    var lastSig = ''

    function render() {
      var PS = ctx.PS
      var state = ctx.state
      var bridgeGate = ctx.bridgeGate
      var el = ctx.elements
      var helpers = ctx.helpers
      if (!el.connectionDetailEl || !PS.ConnectionHealth) return { skipped: true }

      var pendingList = (state.lastPendingSessionIds || []).map(function (id) {
        return { id: id }
      })
      var stale = PS.ConnectionHealth.countStaleLocalWaiting(
        state.sessions,
        state.sessionOrder,
        pendingList,
      )
      var pingStale = bridgeGate.isReady()
        && helpers.getLastPongAt() > 0
        && (Date.now() - helpers.getLastPongAt() > helpers.PING_STALE_MS)
      var hubPidMismatch = !!(state.hubSnapshot && helpers.getConnectedHubPid()
        && state.hubSnapshot.pid && helpers.getConnectedHubPid() !== state.hubSnapshot.pid)
      var health = PS.ConnectionHealth.evaluate({
        bridgeReady: bridgeGate.isReady(),
        hub: state.hubSnapshot,
        staleLocalWaiting: stale,
        localWaitingCount: state.waitingCount,
        pingStale: pingStale,
        hubPidMismatch: hubPidMismatch,
        port: helpers.getWsPort(),
        routingMismatchProject: state.routingMismatch && state.routingMismatch.project,
      })

      var skew = (helpers.getLastExtensionDebugReport() && helpers.getLastExtensionDebugReport().versionSkew) || []
      var routing = state.routingMismatch && state.routingMismatch.project
      var sig = PS.PanelState.buildHealthSignature(health, { skew: skew, routing: routing })
      if (PS.PanelState.shouldSkipHealthRender(lastSig, sig)) return { skipped: true, health: health }
      lastSig = sig

      helpers.setWsStatus(
        health.level,
        PS.PanelState.formatConnectionStatusLabel(health.level, state.hubSnapshot && state.hubSnapshot.pid)
          + (health.portPid || ''),
      )
      if (state.hubSnapshot && state.hubSnapshot.port && el.wsPortEl) {
        el.wsPortEl.textContent = ':' + state.hubSnapshot.port
      }
      el.connectionDetailEl.textContent = health.detail
      el.connectionDetailEl.dataset.level = health.level
      el.connectionDetailEl.title = health.issues.length
        ? health.issues.join('\n')
        : health.detail
      if (helpers.getLastExtensionDebugReport() && helpers.getLastExtensionDebugReport().versionSkew
        && helpers.getLastExtensionDebugReport().versionSkew.length) {
        el.connectionDetailEl.title += '\n' + helpers.getLastExtensionDebugReport().versionSkew.join('\n')
        helpers.showVersionSkewBanner(helpers.getLastExtensionDebugReport().versionSkew)
      } else {
        helpers.showVersionSkewBanner([])
      }
      helpers.updateWaitingBadge()
      helpers.showRoutingBanner(state.routingMismatch && state.routingMismatch.project)
      return { skipped: false, health: health }
    }

    return {
      render: render,
      resetSignature: function () { lastSig = '' },
    }
  }

  exports.createConnectionRenderer = createConnectionRenderer
})(typeof window !== 'undefined'
  ? (window.PanelConnectionModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
