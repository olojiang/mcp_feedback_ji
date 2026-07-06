/**
 * Panel transport / connection helpers — split from panelState.js for maintainability.
 */
(function (exports) {
  'use strict'

  class OutboundQueue {
    constructor(limit) {
      this.limit = typeof limit === 'number' && limit > 0 ? limit : 32
      this.items = []
    }

    enqueue(message) {
      if (!message || typeof message !== 'object') return 0
      if (this.items.length >= this.limit) {
        var dropIdx = -1
        for (var i = this.items.length - 1; i >= 0; i--) {
          if (this.items[i] && this.items[i].type !== 'feedback_response') {
            dropIdx = i
            break
          }
        }
        if (dropIdx >= 0) {
          this.items.splice(dropIdx, 1)
        } else if (message.type !== 'feedback_response') {
          this.items.shift()
        } else {
          return this.items.length
        }
      }
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

  class TransportMetrics {
    constructor() {
      this.bridge = 0
      this.ws = 0
    }

    record(kind) {
      if (kind === 'bridge') this.bridge++
      else if (kind === 'ws') this.ws++
    }

    snapshot() {
      var total = this.bridge + this.ws
      var ratio = total > 0 ? Math.round((this.bridge / total) * 1000) / 1000 : 0
      var primary = 'none'
      if (this.bridge > 0 && this.ws === 0) primary = 'bridge'
      else if (this.ws > 0 && this.bridge === 0) primary = 'ws'
      else if (total > 0) primary = 'mixed'
      return {
        bridge_sends: this.bridge,
        ws_sends: this.ws,
        bridge_ratio: ratio,
        primary_transport: primary,
      }
    }
  }

  class BridgeSessionGate {
    constructor() {
      this.ready = false
      this.registered = false
      this.initialized = false
      this.needsResync = false
    }

    resetForReconnect() {
      if (this.initialized) this.needsResync = true
      this.ready = false
      this.registered = false
    }

    isReady() {
      return this.ready
    }

    onBridgeConnected() {
      this.ready = true
      var isFirst = !this.initialized
      if (isFirst) this.initialized = true
      var stateSync = isFirst || this.needsResync
      if (this.needsResync) this.needsResync = false
      var register = isFirst
      if (register) this.registered = true
      return { register: register, stateSync: stateSync, labels: true }
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
        issues.push(mcpDetached + ' pending: Agent disconnected — Settings → MCP: toggle off/on')
      }
      if (pendingCount > 0 && mcpServers === 0) {
        issues.push('No MCP server connected — Settings → MCP: toggle mcp-feedback-enhanced off/on')
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

  exports.OutboundQueue = OutboundQueue
  exports.TransportMetrics = TransportMetrics
  exports.BridgeSessionGate = BridgeSessionGate
  exports.transportSendWithQueue = transportSendWithQueue
  exports.ConnectionHealth = ConnectionHealth
})(typeof window !== 'undefined'
  ? (window.PanelStateTransportModule = {})
  : (typeof module !== 'undefined' ? module.exports : {}))
