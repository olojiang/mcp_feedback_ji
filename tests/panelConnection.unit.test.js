import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'

describe('panelConnection createConnectionRenderer', () => {
  const code = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'out', 'webview', 'panelConnection.js'),
    'utf8',
  )

  function loadModule() {
    const ctx = { window: { PanelConnectionModule: {} }, console }
    vm.createContext(ctx)
    vm.runInContext(code, ctx, { filename: 'panelConnection.js' })
    return ctx.window.PanelConnectionModule
  }

  it('skips DOM updates when health signature unchanged', () => {
    const mod = loadModule()
    var setCalls = 0
    var renderer = mod.createConnectionRenderer({
      PS: {
        PanelState: {
          buildHealthSignature: (h, extras) => JSON.stringify({ h, extras }),
          shouldSkipHealthRender: (prev, next) => !!prev && prev === next,
          formatConnectionStatusLabel: (level, pid) => (pid ? level + ' pid=' + pid : level),
        },
        ConnectionHealth: {
          countStaleLocalWaiting: () => 0,
          evaluate: () => ({
            level: 'ok',
            label: 'Connected',
            detail: 'Agent: idle',
            portPid: ' pid=1',
            issues: [],
          }),
        },
      },
      state: {
        sessions: {},
        sessionOrder: [],
        lastPendingSessionIds: [],
        waitingCount: 0,
        hubSnapshot: { port: 48201, pid: 1 },
        routingMismatch: null,
      },
      bridgeGate: { isReady: () => true },
      elements: {
        connectionDetailEl: { textContent: '', dataset: {}, title: '' },
        wsPortEl: { textContent: '' },
      },
      helpers: {
        PING_STALE_MS: 60000,
        getLastPongAt: () => Date.now(),
        getConnectedHubPid: () => 1,
        getLastExtensionDebugReport: () => null,
        getWsPort: () => '48201',
        setWsStatus: () => { setCalls++ },
        showVersionSkewBanner: () => {},
        updateWaitingBadge: () => {},
        showRoutingBanner: () => {},
      },
    })

    var first = renderer.render()
    var second = renderer.render()
    assert.equal(first.skipped, false)
    assert.equal(second.skipped, true)
    assert.equal(setCalls, 1)
  })

  it('does not report ping stale when a recent hub message was received after the last pong', () => {
    const mod = loadModule()
    const now = Date.now()
    var evaluatedPingStale = null
    var renderer = mod.createConnectionRenderer({
      PS: {
        PanelState: {
          buildHealthSignature: (h, extras) => JSON.stringify({ h, extras }),
          shouldSkipHealthRender: () => false,
          formatConnectionStatusLabel: (level, pid) => (pid ? level + ' pid=' + pid : level),
        },
        ConnectionHealth: {
          countStaleLocalWaiting: () => 0,
          evaluate: (input) => {
            evaluatedPingStale = input.pingStale
            return {
              level: input.pingStale ? 'degraded' : 'ok',
              label: input.pingStale ? 'Degraded' : 'Connected',
              detail: input.pingStale ? 'Hub ping timeout' : 'Agent: live',
              portPid: '',
              issues: input.pingStale ? ['Hub ping timeout'] : [],
            }
          },
        },
      },
      state: {
        sessions: {},
        sessionOrder: [],
        lastPendingSessionIds: [],
        waitingCount: 0,
        hubSnapshot: { port: 48201, pid: 1 },
        routingMismatch: null,
      },
      bridgeGate: { isReady: () => true },
      elements: {
        connectionDetailEl: { textContent: '', dataset: {}, title: '' },
        wsPortEl: { textContent: '' },
      },
      helpers: {
        PING_STALE_MS: 45000,
        getLastPongAt: () => now - 120000,
        getLastHubActivityAt: () => now,
        getConnectedHubPid: () => 1,
        getLastExtensionDebugReport: () => null,
        getWsPort: () => '48201',
        setWsStatus: () => {},
        showVersionSkewBanner: () => {},
        updateWaitingBadge: () => {},
        showRoutingBanner: () => {},
      },
    })

    var result = renderer.render()
    assert.equal(evaluatedPingStale, false)
    assert.equal(result.health.level, 'ok')
  })
})
