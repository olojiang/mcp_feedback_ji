import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  resolveFeedbackLogPath,
  formatAgentLinkStatus,
} = require('../out/logPaths.js')
const { ConnectionHealth } = require('../out/webview/panelState.js')

describe('logPaths', () => {
  it('resolves standard log file paths', () => {
    assert.match(resolveFeedbackLogPath('extension'), /extension\.log$/)
    assert.match(resolveFeedbackLogPath('mcp-server'), /mcp-server\.log$/)
    assert.match(resolveFeedbackLogPath('webview'), /webview-\d{4}-\d{2}-\d{2}\.log$/)
  })

  it('formatAgentLinkStatus distinguishes idle vs offline', () => {
    assert.equal(formatAgentLinkStatus(0, 0, 0), 'Agent: idle')
    assert.equal(formatAgentLinkStatus(0, 2, 0), 'Agent: offline')
    assert.equal(formatAgentLinkStatus(1, 1, 0), 'Agent: live')
    assert.equal(formatAgentLinkStatus(0, 1, 1), 'Agent: waiting (link lost)')
  })
})

describe('ConnectionHealth agent link label', () => {
  it('shows Agent idle when hub connected but no active MCP call', () => {
    const health = ConnectionHealth.evaluate({
      bridgeReady: true,
      hub: {
        port: 48201,
        pid: 100,
        workspaces: ['/Users/hunter/Workspace/spatial-smart-cc'],
        mcp_servers: 0,
        pending_count: 0,
        mcp_detached_count: 0,
      },
      staleLocalWaiting: 0,
      pingStale: false,
      hubPidMismatch: false,
    })
    assert.equal(health.level, 'ok')
    assert.match(health.detail, /Agent: idle/)
    assert.doesNotMatch(health.detail, /MCP:0/)
  })
})
