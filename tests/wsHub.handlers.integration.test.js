import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

const require = createRequire(import.meta.url)
const origLoad = Module._load
const LOG_PATH = path.join(os.homedir(), '.config/mcp-feedback-enhanced/logs/extension.log')

function vscodeStub() {
  return {
    env: {
      clipboard: {
        writeText: async () => {},
        readText: async () => 'plain-text',
      },
    },
  }
}

describe('wsHub webview handlers', () => {
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
    hub = new WsHub('hub-handlers')
    hub.setWorkspaces(['/tmp/hub-handlers'])
    port = await hub.start()
  })

  after(async () => {
    Module._load = origLoad
    if (hub) await hub.stop()
    hub = null
  })

  it('clipboard_write responds with clipboard_write_ok', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    const replies = []
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    ws.on('message', (raw) => replies.push(JSON.parse(raw.toString())))
    ws.send(JSON.stringify({ type: 'register', clientType: 'webview' }))
    ws.send(JSON.stringify({ type: 'clipboard_write', text: 'hello-copy' }))
    await new Promise((r) => setTimeout(r, 80))
    const ok = replies.find((m) => m.type === 'clipboard_write_ok')
    assert.ok(ok)
    assert.equal(ok.length, 10)
    ws.close()
  })

  it('clipboard_paste responds with clipboard_paste_result text fallback', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    const replies = []
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    ws.on('message', (raw) => replies.push(JSON.parse(raw.toString())))
    ws.send(JSON.stringify({ type: 'register', clientType: 'webview' }))
    ws.send(JSON.stringify({ type: 'clipboard_paste', request_id: 'paste-1' }))
    await new Promise((r) => setTimeout(r, 500))
    const res = replies.find((m) => m.type === 'clipboard_paste_result')
    assert.ok(res)
    assert.equal(res.request_id, 'paste-1')
    assert.equal(res.text, 'plain-text')
    ws.close()
  })

  it('session_displayed log includes trace from pending session', async () => {
    const traceTag = `display-trace-${Date.now()}`

    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise((resolve, reject) => {
      mcp.once('open', resolve)
      mcp.once('error', reject)
    })
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'display trace',
      project_directory: '/tmp/hub-handlers',
      trace_id: traceTag,
    }))
    await new Promise((r) => setTimeout(r, 60))

    const panel = new WebSocket(`ws://127.0.0.1:${port}`)
    const panelMsgs = []
    await new Promise((resolve, reject) => {
      panel.once('open', resolve)
      panel.once('error', reject)
    })
    panel.on('message', (raw) => panelMsgs.push(JSON.parse(raw.toString())))
    panel.send(JSON.stringify({ type: 'register', clientType: 'webview' }))
    await new Promise((r) => setTimeout(r, 40))
    const updated = panelMsgs.find((m) => m.type === 'session_updated')
    assert.ok(updated?.session_id)

    panel.send(JSON.stringify({ type: 'session_displayed', session_id: updated.session_id }))
    await new Promise((r) => setTimeout(r, 120))

    const content = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : ''
    assert.match(content, new RegExp(`sessionDisplayed: ack session=.*trace=${traceTag}`))

    panel.close()
    mcp.close()
  })
})
