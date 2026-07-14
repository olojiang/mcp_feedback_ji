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
      var lastHubActivityAt = helpers.getLastHubActivityAt ? helpers.getLastHubActivityAt() : 0
      var lastHealthyHubAt = Math.max(helpers.getLastPongAt() || 0, lastHubActivityAt || 0)
      var pingStale = bridgeGate.isReady()
        && lastHealthyHubAt > 0
        && ((helpers.now ? helpers.now() : Date.now()) - lastHealthyHubAt > helpers.PING_STALE_MS)
      var connectedHubPid = helpers.getConnectedHubPid()
      var hubPidMismatch = !!(state.hubSnapshot && connectedHubPid
        && state.hubSnapshot.pid && connectedHubPid !== state.hubSnapshot.pid)
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

      var extensionDebugReport = helpers.getLastExtensionDebugReport()
      var skew = (extensionDebugReport && extensionDebugReport.versionSkew) || []
      var routing = state.routingMismatch && state.routingMismatch.project
      var sig = PS.PanelState.buildHealthSignature(health, { skew: skew, routing: routing })
      if (PS.PanelState.shouldSkipHealthRender(lastSig, sig)) return { skipped: true, health: health }
      lastSig = sig

      helpers.setWsStatus(
        health.level === 'ok' ? 'connected' : health.level,
        PS.PanelState.formatConnectionStatusLabel(health.level) + (health.portPid || ''),
      )
      if (state.hubSnapshot && state.hubSnapshot.port && el.wsPortEl) {
        el.wsPortEl.textContent = ':' + state.hubSnapshot.port
      }
      el.connectionDetailEl.textContent = health.detail
      el.connectionDetailEl.dataset.level = health.level
      el.connectionDetailEl.title = health.issues.length
        ? health.issues.join('\n')
        : health.detail
      if (skew.length) {
        el.connectionDetailEl.title += '\n' + skew.join('\n')
        helpers.showVersionSkewBanner(skew)
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

  function createConnectionController(ctx) {
    var state = ctx.state
    var el = ctx.elements
    var helpers = ctx.helpers
    var lastPongAt = 0
    var lastHubActivityAt = 0
    var connectedHubPid = null

    var initialPort = helpers.getWsPort()
    if (initialPort && el.wsPortEl) el.wsPortEl.textContent = ':' + initialPort

    function now() {
      return helpers.now ? helpers.now() : Date.now()
    }

    function setStatus(status, detail) {
      var defaults = {
        connected: 'Connected',
        degraded: 'Degraded',
        connecting: 'Connecting...',
        disconnected: 'Disconnected — click ↻ or Reload Window',
      }
      if (el.wsStatusEl) el.wsStatusEl.dataset.state = status
      if (el.wsStatusLabel) el.wsStatusLabel.textContent = detail || defaults[status] || status
    }

    function applyHubSnapshot(hub) {
      if (!hub || typeof hub !== 'object') return
      state.hubSnapshot = hub
      if (hub.pid) connectedHubPid = hub.pid
    }

    var renderer = createConnectionRenderer({
      PS: ctx.PS,
      state: state,
      bridgeGate: ctx.bridgeGate,
      elements: el,
      helpers: {
        PING_STALE_MS: helpers.PING_STALE_MS,
        now: now,
        getLastPongAt: function () { return lastPongAt },
        getLastHubActivityAt: function () { return lastHubActivityAt },
        getConnectedHubPid: function () { return connectedHubPid },
        getLastExtensionDebugReport: helpers.getLastExtensionDebugReport,
        getWsPort: helpers.getWsPort,
        setWsStatus: setStatus,
        showVersionSkewBanner: helpers.showVersionSkewBanner,
        updateWaitingBadge: helpers.updateWaitingBadge,
        showRoutingBanner: helpers.showRoutingBanner,
      },
    })

    return {
      applyHubSnapshot: applyHubSnapshot,
      getConnectedHubPid: function () { return connectedHubPid },
      onProtocolActivity: function (message) {
        lastHubActivityAt = now()
        if (message && message.type === 'pong') {
          lastPongAt = lastHubActivityAt
          if (message.hub) applyHubSnapshot(message.hub)
        }
      },
      onConnected: function (info, detail) {
        info = info || {}
        if (info.pid) connectedHubPid = info.pid
        if (info.port && el.wsPortEl) el.wsPortEl.textContent = ':' + info.port
        var label = detail || 'Connected'
        if (!detail && info.port) label += ' :' + info.port
        if (!detail && info.pid) label += ' pid=' + info.pid
        setStatus('connected', label)
      },
      onConnecting: function (detail) { setStatus('connecting', detail) },
      onDisconnected: function (detail) { setStatus('disconnected', detail) },
      render: function () { return renderer.render() },
      resetSignature: function () { renderer.resetSignature() },
    }
  }

  exports.createConnectionController = createConnectionController
  exports.createConnectionRenderer = createConnectionRenderer
})(typeof window !== 'undefined'
  ? (window.PanelConnectionModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
