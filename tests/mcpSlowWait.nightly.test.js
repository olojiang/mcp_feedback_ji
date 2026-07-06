/**
 * Nightly slow test: MCP WebSocket must stay open >90s (hub stale sweep).
 * Run: MCP_SLOW_TESTS=1 npm run test:nightly
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'
import { installIsolatedConfig } from './helpers/isolatedConfig.js'

const require = createRequire(import.meta.url)
installIsolatedConfig('mcp-feedback-slow-wait-')
const origLoad = Module._load
const SLOW = process.env.MCP_SLOW_TESTS === '1'

function vscodeStub() {
  return {
    env: {
      clipboard: {
        writeText: async () => {},
        readText: async () => '',
      },
    },
  }
}

describe('mcp slow wait (>90s real time)', { skip: !SLOW, timeout: 130_000 }, () => {
  let hub = null
  let port = 0

  before(async () => {
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') return vscodeStub()
      return origLoad.call(this, request, parent, isMain)
    }
    const hubPath = require.resolve('../out/server/wsHub.js')
    delete require.cache[hubPath]
    const { WsHub } = require('../out/server/wsHub.js')
    hub = new WsHub('mcp-slow-nightly')
    hub.setWorkspaces(['/tmp/mcp-slow-nightly'])
    port = await hub.start()
  })

  after(async () => {
    Module._load = origLoad
    if (hub) await hub.stop()
    hub = null
  })

  it('keeps mcp-server connected for 95s without user feedback', async () => {
    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise((resolve, reject) => {
      mcp.once('open', resolve)
      mcp.once('error', reject)
    })
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'nightly slow wait',
      project_directory: '/tmp/mcp-slow-nightly',
      trace_id: 'slow-nightly-1',
    }))

    await new Promise((r) => setTimeout(r, 95_000))

    assert.equal(mcp.readyState, WebSocket.OPEN)
    assert.equal(hub.getConnectedClients().mcpServers, 1)
    mcp.close()
  })
})
