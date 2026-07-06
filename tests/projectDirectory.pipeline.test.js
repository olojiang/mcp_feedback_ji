import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'
import { installIsolatedConfig } from './helpers/isolatedConfig.js'

const require = createRequire(import.meta.url)
installIsolatedConfig('mcp-feedback-project-pipeline-')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./stubs/vscode.cjs')
  }
  return origLoad.call(this, request, parent, isMain)
}

const { WsHub } = require('../out/server/wsHub.js')
const { PanelState } = require('../out/webview/panelState.js')
const { pickServerForProject } = require('../mcp-server/dist/serverDiscoveryCore.js')

describe('project_directory pipeline', () => {
  it('MCP discovery routes explicit project_directory to matching hub', () => {
    const picked = pickServerForProject(
      [
        { port: 48201, pid: 1, projectPath: '/Users/hunter/Workspace/spatial-smart-cc', version: '1' },
        { port: 48202, pid: 2, projectPath: '/Users/hunter/Workspace/mcp_feedback_ji', version: '1' },
      ],
      '/Users/hunter/Workspace/mcp_feedback_ji',
    )
    assert.equal(picked.port, 48202)
    assert.equal(picked.projectPath, '/Users/hunter/Workspace/mcp_feedback_ji')
  })

  it('state_sync pending_sessions carry project_directory wire field', async () => {
    const hub = new WsHub('test-project-wire')
    hub.setWorkspaces(['/tmp/wire-workspace'])
    const port = await hub.start()
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
      summary: 'Wire test',
      project_directory: '/tmp/wire-workspace',
    }))
    await new Promise((r) => setTimeout(r, 30))

    bridge.deliver(JSON.stringify({ type: 'get_state' }))
    await new Promise((r) => setTimeout(r, 30))

    const stateSync = out.find((m) => m.type === 'state_sync')
    assert.ok(stateSync, 'expected state_sync in webview out')
    const pending = stateSync.pending_sessions || []
    assert.equal(pending.length, 1)
    assert.equal(pending[0].project_directory, '/tmp/wire-workspace')
    mcp.close()
    bridge.dispose()
    await hub.stop()
  })

  it('session_updated broadcast includes project_directory', async () => {
    const hub = new WsHub('test-session-updated-project')
    hub.setWorkspaces(['/tmp/broadcast-workspace'])
    const port = await hub.start()
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
      summary: 'Broadcast project tag',
      project_directory: '/tmp/broadcast-workspace',
    }))
    await new Promise((r) => setTimeout(r, 40))
    const updated = out.find((m) => m.type === 'session_updated')
    assert.ok(updated)
    assert.equal(updated.project_directory, '/tmp/broadcast-workspace')
    mcp.close()
    bridge.dispose()
    await hub.stop()
  })

  it('panel state_sync ignores foreign pending_sessions by project_directory', () => {
    const state = new PanelState()
    state.panelWorkspace = '/Users/hunter/Workspace/spatial-smart-cc'
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        {
          id: 'fb-local',
          label: 'local',
          summary: 'Local question',
          project_directory: '/Users/hunter/Workspace/spatial-smart-cc',
        },
        {
          id: 'fb-foreign',
          label: 'foreign',
          summary: 'Foreign question',
          project_directory: '/Users/hunter/Workspace/mcp_feedback_ji',
        },
      ],
      pending_comments: [],
      pending_images: [],
      hub: { workspaces: ['/Users/hunter/Workspace/spatial-smart-cc'] },
    })
    assert.ok(state.sessions['fb-local'])
    assert.equal(state.sessions['fb-foreign'], undefined)
    assert.deepEqual(state.lastPendingSessionIds, ['fb-local'])
  })

  it('extensionClient wire payload includes project_directory', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const src = readFileSync(join(root, 'mcp-server/src/extensionClient.ts'), 'utf8')
    assert.match(src, /project_directory:\s*projectDirectory/)
    assert.match(src, /type:\s*'feedback_request'/)
  })
})
