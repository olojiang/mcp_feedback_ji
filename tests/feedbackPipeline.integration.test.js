import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'
import { installIsolatedConfig } from './helpers/isolatedConfig.js'

const require = createRequire(import.meta.url)
installIsolatedConfig('mcp-feedback-pipeline-')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./stubs/vscode.cjs')
  }
  return origLoad.call(this, request, parent, isMain)
}

const { WsHub } = require('../out/server/wsHub.js')
const { PanelState } = require('../out/webview/panelState.js')

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

function waitFor(fn, timeoutMs = 3000, intervalMs = 30) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      try {
        const value = fn()
        if (value) {
          resolve(value)
          return
        }
      } catch (e) {
        reject(e)
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout'))
        return
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}

describe('feedback pipeline E2E integration', () => {
  let hub = null
  let port = 0
  let bridge = null
  const webviewOut = []

  function attachPanelBridge() {
    bridge?.dispose()
    webviewOut.length = 0
    bridge = hub.attachWebview((msg) => webviewOut.push(msg))
    bridge.deliver(JSON.stringify({ type: 'register', clientType: 'webview' }))
    return bridge
  }

  before(async () => {
    hub = new WsHub('test-pipeline')
    hub.setWorkspaces(['/tmp/pipeline-workspace'])
    port = await hub.start()
    attachPanelBridge()
  })

  after(async () => {
    webviewOut.length = 0
    bridge?.dispose()
    if (hub) await hub.stop()
    hub = null
    bridge = null
  })

  it('Agent request to UI session_updated to response to MCP feedback_result', async () => {
    webviewOut.length = 0
    const panel = new PanelState()

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
      summary: 'E2E round-trip question',
      project_directory: '/tmp/pipeline-workspace',
    }))

    const sessionUpdated = await waitFor(() => {
      const hubMsg = webviewOut.find((m) => m.type === 'session_updated')
      if (!hubMsg) return null
      panel.handleMessage(hubMsg)
      return hubMsg
    })

    assert.ok(sessionUpdated.session_id)
    const submitCmds = panel.submitFeedback('E2E user reply', [], {
      session_id: sessionUpdated.session_id,
    })
    const wsCmd = submitCmds.find((c) => c.type === 'ws_send')
    assert.ok(wsCmd)
    bridge.deliver(JSON.stringify(wsCmd.message))

    const result = await resultPromise
    assert.match(result.feedback, /E2E user reply/)
    mcp.close()
  })

  it('blocks webview from injecting feedback_request', async () => {
    const errors = []
    const rogue = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(rogue)
    rogue.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.type === 'protocol_error') errors.push(msg.error)
    })
    rogue.send(JSON.stringify({ type: 'register', clientType: 'webview' }))
    rogue.send(JSON.stringify({ type: 'feedback_request', summary: 'rejected' }))
    await new Promise((r) => setTimeout(r, 50))
    assert.ok(errors.some((e) => String(e).includes('pipeline_reject:mcp')))
    rogue.close()
  })

  it('rejects feedback_request for foreign project on hub', async () => {
    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    const errors = []
    mcp.on('message', (raw) => {
      const msg = JSON.parse(String(raw))
      if (msg.type === 'feedback_error') errors.push(msg.error)
    })
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Foreign project',
      project_directory: '/other/workspace',
    }))
    await new Promise((r) => setTimeout(r, 50))
    assert.ok(errors.some((e) => String(e).includes('Project mismatch')))
    mcp.close()
  })

  it('replays session_updated when webview connects late', async () => {
    bridge?.dispose()
    bridge = null
    webviewOut.length = 0

    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Late panel connect',
      project_directory: '/tmp/pipeline-workspace',
    }))
    await new Promise((r) => setTimeout(r, 40))
    assert.equal(webviewOut.filter((m) => m.type === 'session_updated').length, 0)

    attachPanelBridge()
    await new Promise((r) => setTimeout(r, 80))

    const replay = webviewOut.find((m) => m.type === 'session_updated' && m.summary === 'Late panel connect')
    assert.ok(replay)

    const cleanupPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cleanup timeout')), 2000)
      mcp.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg.type === 'feedback_result') {
          clearTimeout(timer)
          resolve(msg)
        }
      })
    })
    bridge.deliver(JSON.stringify({
      type: 'feedback_response',
      session_id: replay.session_id,
      feedback: 'late cleanup',
      images: [],
    }))
    await cleanupPromise
    mcp.close()
  })

  it('stale session_id from panel falls back to sole pending on server', async () => {
    attachPanelBridge()

    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 3000)
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
      summary: 'Stale id test',
      project_directory: '/tmp/pipeline-workspace',
    }))

    await waitFor(() =>
      webviewOut.find((m) => m.type === 'session_updated' && m.summary === 'Stale id test'),
    )

    bridge.deliver(JSON.stringify({
      type: 'feedback_response',
      session_id: 'fb-stale-from-localStorage',
      feedback: 'Fallback reply',
      images: [],
    }))

    const result = await resultPromise
    assert.match(result.feedback, /Fallback reply/)
    mcp.close()
  })
})
