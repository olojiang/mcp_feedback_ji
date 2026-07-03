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

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve(undefined)
      return
    }
    ws.once('open', resolve)
    ws.once('error', reject)
  })
}

function waitMessage(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs)
    ws.once('message', (data) => {
      clearTimeout(timer)
      resolve(JSON.parse(String(data)))
    })
  })
}

describe('feedback delivery integration', () => {
  /** @type {WsHub | null} */
  let hub = null
  let port = 0
  const webviewOut = []

  before(async () => {
    hub = new WsHub('test-integration')
    hub.setWorkspaces(['/tmp/test-workspace'])
    port = await hub.start()
    hub.attachWebview((msg) => webviewOut.push(msg))
  })

  after(async () => {
    webviewOut.length = 0
    if (hub) await hub.stop()
    hub = null
  })

  it('delivers session_updated to attached webview when MCP requests feedback', async () => {
    webviewOut.length = 0
    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))

    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Integration test question',
      project_directory: '/tmp/test-workspace',
    }))

    await new Promise((r) => setTimeout(r, 50))

    const sessionUpdated = webviewOut.find((m) => m.type === 'session_updated')
    assert.ok(sessionUpdated, 'webview must receive session_updated')
    assert.equal(sessionUpdated.summary, 'Integration test question')
    assert.ok(sessionUpdated.session_id)

    mcp.close()
  })

  it('replays pending sessions to webview on register after late connect', async () => {
    webviewOut.length = 0
    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Late webview replay test',
      project_directory: '/tmp/test-workspace',
    }))
    await new Promise((r) => setTimeout(r, 30))

    const lateWebview = new WebSocket(`ws://127.0.0.1:${port}`)
    const messages = []
    lateWebview.on('message', (d) => messages.push(JSON.parse(String(d))))
    await waitOpen(lateWebview)
    await new Promise((r) => setTimeout(r, 20))

    lateWebview.send(JSON.stringify({ type: 'register', clientType: 'webview' }))
    await new Promise((r) => setTimeout(r, 80))

    const replay = messages.find((m) => m.type === 'session_updated' && m.summary === 'Late webview replay test')
    const stateSync = messages.find((m) => m.type === 'state_sync')
    assert.ok(replay || stateSync, 'late webview gets session via replay or state_sync')
    if (stateSync) {
      assert.ok(stateSync.pending_sessions.some((p) => p.summary === 'Late webview replay test'))
    }

    mcp.close()
    lateWebview.close()
  })
})
