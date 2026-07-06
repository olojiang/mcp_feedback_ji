import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'
import { installIsolatedConfig } from './helpers/isolatedConfig.js'

const require = createRequire(import.meta.url)
installIsolatedConfig('mcp-feedback-timing-')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./stubs/vscode.cjs')
  }
  return origLoad.call(this, request, parent, isMain)
}

const { WsHub } = require('../out/server/wsHub.js')
const { BridgeSessionGate, PanelState } = require('../out/webview/panelState.js')

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve()
    ws.once('open', resolve)
    ws.once('error', reject)
  })
}

describe('timing E2E: boot debounce + feedback round-trip', () => {
  let hub = null
  let port = 0

  before(async () => {
    hub = new WsHub('timing-e2e')
    hub.setWorkspaces(['/tmp/timing-workspace'])
    port = await hub.start()
  })

  after(async () => {
    if (hub) await hub.stop()
    hub = null
  })

  it('single register on boot; debounced reconnect; MCP round-trip', async () => {
    const gate = new BridgeSessionGate()
    const out = []
    const bridge = hub.attachWebview((msg) => out.push(msg))

    const boot = gate.onBridgeConnected()
    assert.equal(boot.register, true)
    bridge.deliver(JSON.stringify({ type: 'register', clientType: 'webview' }))

    const dup = gate.onBridgeConnected()
    assert.equal(dup.register, false)
    assert.equal(dup.stateSync, false)

    assert.equal(PanelState.shouldDebounceReconnect(1000, 1100), true)
    assert.equal(PanelState.shouldDebounceReconnect(1000, 2300), false)

    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no feedback_result')), 3000)
      mcp.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg.type === 'feedback_result') {
          clearTimeout(timer)
          resolve(msg)
        }
      })
    })

    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Timing E2E question',
      project_directory: '/tmp/timing-workspace',
    }))

    await new Promise((r) => setTimeout(r, 50))
    const sessionMsg = out.find((m) => m.type === 'session_updated')
    assert.ok(sessionMsg)

    const panel = new PanelState()
    panel.handleMessage(sessionMsg)
    const cmds = panel.submitFeedback('timing ok', [], { session_id: sessionMsg.session_id })
    const wsCmd = cmds.find((c) => c.type === 'ws_send')
    bridge.deliver(JSON.stringify(wsCmd.message))

    const result = await resultPromise
    assert.match(result.feedback, /timing ok/)
    bridge.dispose()
    mcp.close()
  })
})
