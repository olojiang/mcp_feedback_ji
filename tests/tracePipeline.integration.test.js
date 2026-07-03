import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'

const require = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./stubs/vscode.cjs')
  }
  return origLoad.call(this, request, parent, isMain)
}

const { WsHub } = require('../out/server/wsHub.js')
const { PanelState } = require('../out/webview/panelState.js')

describe('trace_id pipeline integration', () => {
  let hub = null
  let port = 0

  before(async () => {
    hub = new WsHub('trace-pipeline')
    hub.setWorkspaces(['/tmp/trace-workspace'])
    port = await hub.start()
  })

  after(async () => {
    if (hub) await hub.stop()
    hub = null
  })

  it('propagates trace_id from MCP request to session_updated and panel state', async () => {
    const out = []
    const bridge = hub.attachWebview((msg) => out.push(msg))
    bridge.deliver(JSON.stringify({ type: 'register', clientType: 'webview' }))

    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise((resolve, reject) => {
      mcp.once('open', resolve)
      mcp.once('error', reject)
    })
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Trace pipeline question',
      project_directory: '/tmp/trace-workspace',
      trace_id: 'cursor-trace-42',
    }))

    await new Promise((r) => setTimeout(r, 40))
    const updated = out.find((m) => m.type === 'session_updated')
    assert.ok(updated)
    assert.equal(updated.trace_id, 'cursor-trace-42')

    const panel = new PanelState()
    panel.handleMessage(updated)
    assert.equal(panel.sessions[updated.session_id].traceId, 'cursor-trace-42')

    bridge.dispose()
    mcp.close()
  })
})
