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
})
