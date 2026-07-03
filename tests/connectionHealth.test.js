import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ConnectionHealth, PanelState } = require('../out/webview/panelState.js')

describe('ConnectionHealth', () => {
  it('reports ok when bridge, mcp, and server queue align', () => {
    const health = ConnectionHealth.evaluate({
      bridgeReady: true,
      hub: {
        port: 48201,
        pid: 100,
        workspaces: ['/Users/hunter/Workspace/spatial-smart-cc'],
        mcp_servers: 1,
        pending_count: 1,
        mcp_detached_count: 0,
      },
      staleLocalWaiting: 0,
      pingStale: false,
      hubPidMismatch: false,
    })
    assert.equal(health.level, 'ok')
    assert.equal(health.label, 'Connected')
    assert.match(health.detail, /WS:spatial-smart-cc/)
    assert.equal(health.issues.length, 0)
  })

  it('flags degraded when UI shows connected but mcp is gone', () => {
    const health = ConnectionHealth.evaluate({
      bridgeReady: true,
      hub: {
        port: 48201,
        pid: 100,
        workspaces: ['/Users/hunter/Workspace/spatial-smart-cc'],
        mcp_servers: 0,
        pending_count: 1,
        mcp_detached_count: 1,
      },
      staleLocalWaiting: 0,
      pingStale: false,
      hubPidMismatch: false,
    })
    assert.equal(health.level, 'degraded')
    assert.ok(health.issues.some((i) => i.includes('Agent disconnected')))
  })

  it('flags stale local tabs not present on server queue', () => {
    const health = ConnectionHealth.evaluate({
      bridgeReady: true,
      hub: {
        port: 48202,
        pid: 200,
        workspaces: ['/Users/hunter/Workspace/system_monitor'],
        mcp_servers: 1,
        pending_count: 1,
        mcp_detached_count: 0,
      },
      staleLocalWaiting: 2,
      pingStale: false,
      hubPidMismatch: false,
    })
    assert.equal(health.level, 'degraded')
    assert.ok(health.issues.some((i) => i.includes('local tab')))
  })

  it('isolates workspace label per hub snapshot', () => {
    assert.equal(
      ConnectionHealth.workspaceLabel(['/Users/hunter/Workspace/spatial-smart-cc']),
      'spatial-smart-cc',
    )
    assert.equal(
      ConnectionHealth.workspaceLabel(['/Users/hunter/Workspace/system_monitor']),
      'system_monitor',
    )
  })

  it('counts stale local waiting sessions against pending list', () => {
    const ps = new PanelState()
    ps.handleMessage({ type: 'session_updated', session_id: 'fb-old', summary: 'Old' })
    ps.handleMessage({ type: 'session_updated', session_id: 'fb-new', summary: 'New' })
    const stale = ConnectionHealth.countStaleLocalWaiting(
      ps.sessions,
      ps.sessionOrder,
      [{ id: 'fb-new' }],
    )
    assert.equal(stale, 1)
    assert.equal(ps.sessions['fb-old'].waiting, true)
    assert.equal(ps.sessions['fb-new'].waiting, true)
  })
})
