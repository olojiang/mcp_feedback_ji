import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PS = require('../static/panelState.js')
const {
  createConnectionController,
  createConnectionRenderer,
} = require('../static/panelConnection.js')

function createHarness(overrides = {}) {
  const calls = {
    setWsStatus: [],
    versionSkewBanner: [],
    waitingBadge: 0,
    routingBanner: [],
  }
  const state = {
    sessions: {},
    sessionOrder: [],
    lastPendingSessionIds: [],
    waitingCount: 0,
    hubSnapshot: {
      port: 48201,
      pid: 11,
      mcp_servers: 1,
      pending_count: 0,
      mcp_detached_count: 0,
      workspaces: ['/workspace/current'],
    },
    routingMismatch: null,
    ...overrides.state,
  }
  const elements = {
    connectionDetailEl: { textContent: '', dataset: {}, title: '' },
    wsPortEl: { textContent: '' },
  }
  const helpers = {
    PING_STALE_MS: 45_000,
    now: () => 100_000,
    getLastPongAt: () => 99_000,
    getLastHubActivityAt: () => 0,
    getConnectedHubPid: () => 11,
    getLastExtensionDebugReport: () => null,
    getWsPort: () => 48201,
    setWsStatus: (...args) => calls.setWsStatus.push(args),
    showVersionSkewBanner: (value) => calls.versionSkewBanner.push(value),
    updateWaitingBadge: () => { calls.waitingBadge++ },
    showRoutingBanner: (value) => calls.routingBanner.push(value),
    ...overrides.helpers,
  }
  const renderer = createConnectionRenderer({
    PS,
    state,
    bridgeGate: { isReady: () => true },
    elements,
    helpers,
  })
  return { calls, elements, renderer, state }
}

describe('panelConnection behavior', () => {
  it('skips every DOM-facing update when the health signature is unchanged', () => {
    const { calls, renderer } = createHarness()

    assert.equal(renderer.render().skipped, false)
    assert.equal(renderer.render().skipped, true)
    assert.equal(calls.setWsStatus.length, 1)
    assert.equal(calls.setWsStatus[0][0], 'connected')
    assert.equal(calls.setWsStatus[0][1], 'Connected pid=11')
    assert.equal(calls.versionSkewBanner.length, 1)
    assert.equal(calls.waitingBadge, 1)
    assert.deepEqual(calls.routingBanner, [null])
  })

  it('renders stale ping, hub PID mismatch, and routing mismatch as degraded', () => {
    const { calls, elements, renderer } = createHarness({
      state: {
        hubSnapshot: {
          port: 48201,
          pid: 22,
          mcp_servers: 1,
          pending_count: 0,
          mcp_detached_count: 0,
          workspaces: ['/workspace/current'],
        },
        routingMismatch: { project: '/workspace/other' },
      },
      helpers: {
        // A synthetic clock keeps this boundary test deterministic.
        now: () => 9_000_000_050_000,
        getLastPongAt: () => 9_000_000_000_000,
        getConnectedHubPid: () => 11,
      },
    })

    const result = renderer.render()

    assert.equal(result.health.level, 'degraded')
    assert.match(elements.connectionDetailEl.title, /Hub ping timeout/)
    assert.match(elements.connectionDetailEl.title, /Hub restarted \(pid changed\)/)
    assert.match(elements.connectionDetailEl.title, /Feedback routed to other workspace: \/workspace\/other/)
    assert.equal(elements.connectionDetailEl.dataset.level, 'degraded')
    assert.deepEqual(calls.routingBanner, ['/workspace/other'])
  })

  it('resetSignature forces an otherwise identical health view to redraw', () => {
    const { calls, renderer } = createHarness()

    renderer.render()
    assert.equal(renderer.render().skipped, true)
    renderer.resetSignature()

    assert.equal(renderer.render().skipped, false)
    assert.equal(calls.setWsStatus.length, 2)
    assert.equal(calls.waitingBadge, 2)
  })
})

describe('panelConnection controller', () => {
  function createControllerHarness() {
    const calls = { waitingBadge: 0 }
    const state = {
      sessions: {},
      sessionOrder: [],
      lastPendingSessionIds: [],
      waitingCount: 0,
      hubSnapshot: null,
      routingMismatch: null,
    }
    const elements = {
      connectionDetailEl: { textContent: '', dataset: {}, title: '' },
      wsPortEl: { textContent: '' },
      wsStatusEl: { dataset: {} },
      wsStatusLabel: { textContent: '' },
    }
    let now = 1_000
    const controller = createConnectionController({
      PS,
      state,
      bridgeGate: { isReady: () => true },
      elements,
      helpers: {
        PING_STALE_MS: 45_000,
        now: () => now,
        getLastExtensionDebugReport: () => null,
        getWsPort: () => 48201,
        showVersionSkewBanner: () => {},
        updateWaitingBadge: () => { calls.waitingBadge++ },
        showRoutingBanner: () => {},
      },
    })
    return { calls, controller, elements, setNow: (value) => { now = value }, state }
  }

  it('owns protocol activity, pong freshness, and hub snapshot state', () => {
    assert.equal(typeof createConnectionController, 'function')
    const { controller, setNow, state } = createControllerHarness()
    const hub = {
      port: 48201,
      pid: 11,
      mcp_servers: 1,
      pending_count: 0,
      mcp_detached_count: 0,
    }

    controller.onConnected({ port: 48201, pid: 11 })
    controller.onProtocolActivity({ type: 'pong', hub })
    setNow(50_000)

    assert.equal(state.hubSnapshot, hub)
    assert.equal(controller.render().health.level, 'degraded')
    controller.onProtocolActivity({ type: 'session_updated' })
    assert.equal(controller.render().health.level, 'ok')
    assert.equal(controller.getConnectedHubPid(), 11)
  })

  it('owns connected, connecting, and disconnected status rendering', () => {
    const { controller, elements } = createControllerHarness()

    controller.onConnected({ port: 48201, pid: 11 })
    assert.equal(elements.wsStatusEl.dataset.state, 'connected')
    assert.equal(elements.wsStatusLabel.textContent, 'Connected :48201 pid=11')
    assert.equal(elements.wsPortEl.textContent, ':48201')

    controller.onConnecting('Retry #1')
    assert.equal(elements.wsStatusEl.dataset.state, 'connecting')
    assert.equal(elements.wsStatusLabel.textContent, 'Retry #1')

    controller.onDisconnected()
    assert.equal(elements.wsStatusEl.dataset.state, 'disconnected')
    assert.match(elements.wsStatusLabel.textContent, /Reload Window/)
  })
})
