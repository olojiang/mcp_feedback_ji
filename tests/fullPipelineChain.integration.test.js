/**
 * Full Agent→MCP→Hub→Panel→Hub→MCP chain (same wire as extensionClient).
 * Verifies project_directory on request and feedback_response echo.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'
import { installIsolatedConfig } from './helpers/isolatedConfig.js'

const require = createRequire(import.meta.url)
installIsolatedConfig('mcp-feedback-full-pipeline-')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./stubs/vscode.cjs')
  }
  return origLoad.call(this, request, parent, isMain)
}

const { WsHub } = require('../out/server/wsHub.js')
const { PanelState } = require('../out/webview/panelState.js')
const { PipelineHop } = require('../out/pipelineContracts.js')

const PROJECT = '/tmp/full-pipeline-workspace'

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve()
    ws.once('open', resolve)
    ws.once('error', reject)
  })
}

describe('full pipeline chain (MCP wire → hub → panel → MCP)', () => {
  let hub = null
  let port = 0
  let bridge = null

  before(async () => {
    hub = new WsHub('full-pipeline')
    hub.setWorkspaces([PROJECT])
    port = await hub.start()
  })

  after(async () => {
    bridge?.dispose()
    if (hub) await hub.stop()
    hub = null
  })

  function attachPanelBridge(out) {
    bridge?.dispose()
    bridge = hub.attachWebview((msg) => out.push(msg))
    bridge.deliver(JSON.stringify({ type: 'register', clientType: 'webview' }))
    return bridge
  }

  it('round-trips with project_directory on request and feedback_response', async () => {
    const out = []
    const hops = []
    attachPanelBridge(out)

    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    hops.push(PipelineHop.MCP_REQUEST)

    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no feedback_result')), 5000)
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
      summary: 'Full chain question',
      project_directory: PROJECT,
    }))

    const sessionUpdated = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no session_updated')), 3000)
      const tick = () => {
        const msg = out.find((m) => m.type === 'session_updated')
        if (msg) {
          clearTimeout(timer)
          resolve(msg)
        } else {
          setTimeout(tick, 20)
        }
      }
      tick()
    })
    hops.push(PipelineHop.HUB_BROADCAST)
    assert.equal(sessionUpdated.project_directory, PROJECT)

    const panel = new PanelState()
    panel.handleMessage(sessionUpdated)
    const cmds = panel.submitFeedback('full chain reply', [], {
      session_id: sessionUpdated.session_id,
    })
    const wsCmd = cmds.find((c) => c.type === 'ws_send')
    assert.equal(wsCmd.message.project_directory, PROJECT)
    hops.push(PipelineHop.UI_RESPONSE)
    bridge.deliver(JSON.stringify(wsCmd.message))
    bridge.deliver(JSON.stringify({
      type: 'session_displayed',
      session_id: sessionUpdated.session_id,
    }))
    hops.push(PipelineHop.UI_DISPLAYED)

    const result = await resultPromise
    hops.push(PipelineHop.MCP_RESULT)
    assert.match(result.feedback, /full chain reply/)
    assert.deepEqual(hops, [
      PipelineHop.MCP_REQUEST,
      PipelineHop.HUB_BROADCAST,
      PipelineHop.UI_RESPONSE,
      PipelineHop.UI_DISPLAYED,
      PipelineHop.MCP_RESULT,
    ])
    mcp.close()
  })

  it('connectToExtension uses same register + feedback_request wire', async () => {
    const out = []
    attachPanelBridge(out)
    const { connectToExtension } = await import('../mcp-server/dist/extensionClient.js')
    const mcp = await connectToExtension(port)
    assert.equal(mcp.readyState, WebSocket.OPEN)

    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Wire parity check',
      project_directory: PROJECT,
    }))

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 3000)
      const tick = () => {
        if (out.some((m) => m.type === 'session_updated' && m.summary === 'Wire parity check')) {
          clearTimeout(timer)
          resolve()
        } else {
          setTimeout(tick, 20)
        }
      }
      tick()
    })

    const wireSession = out.find((m) => m.summary === 'Wire parity check')
    bridge.deliver(JSON.stringify({
      type: 'feedback_response',
      session_id: wireSession.session_id,
      feedback: 'cleanup',
      project_directory: PROJECT,
    }))
    mcp.close()
  })

  it('resolves correct session when multiple tabs are waiting', async () => {
    const sessions = []
    attachPanelBridge(sessions)

    const mcpA = new WebSocket(`ws://127.0.0.1:${port}`)
    const mcpB = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitOpen(mcpA)
    await waitOpen(mcpB)
    mcpA.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcpB.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))

    mcpA.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Question A',
      project_directory: PROJECT,
    }))
    mcpB.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Question B',
      project_directory: PROJECT,
    }))

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sessions timeout')), 3000)
      const tick = () => {
        if (sessions.some((s) => s.summary === 'Question B')) {
          clearTimeout(timer)
          resolve()
        } else {
          setTimeout(tick, 30)
        }
      }
      tick()
    })

    const target = sessions.find((s) => s.summary === 'Question B')
    assert.ok(target)
    const panel = new PanelState()
    for (const s of sessions) panel.handleMessage(s)
    panel.setActiveSession(target.session_id)
    const cmds = panel.submitFeedback('Answer B only', [])
    bridge.deliver(JSON.stringify(cmds.find((c) => c.type === 'ws_send').message))

    const resultB = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout B')), 3000)
      mcpB.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg.type === 'feedback_result') {
          clearTimeout(timer)
          resolve(msg)
        }
      })
    })
    assert.match(resultB.feedback, /Answer B only/)
    mcpA.close()
    mcpB.close()
  })
})
