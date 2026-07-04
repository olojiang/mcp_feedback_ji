import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { WebSocket } from 'ws'

const require = createRequire(import.meta.url)
const { WsHub } = require('../out/server/wsHub.js')
const {
  pendingSessionsFilePath,
  readPersistedPendingSessions,
  isPersistedSessionExpired,
} = require('../out/pendingSessionStore.js')

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve()
    ws.once('open', resolve)
    ws.once('error', reject)
  })
}

function waitFor(fn, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      try {
        const v = fn()
        if (v) return resolve(v)
      } catch (e) {
        return reject(e)
      }
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'))
      setTimeout(tick, 30)
    }
    tick()
  })
}

describe('pending restore integration', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pending-restore-'))
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    delete process.env.MCP_FEEDBACK_CONFIG_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('hub stop/start restores pending session and replays to webview', async () => {
    const workspace = '/tmp/pending-restore-ws'
    const hub1 = new WsHub('pending-restore-it')
    hub1.setWorkspaces([workspace])
    const port1 = await hub1.start()

    const mcp = new WebSocket(`ws://127.0.0.1:${port1}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Restore me after restart',
      project_directory: workspace,
      trace_id: 'trace-restore-1',
    }))
    await waitFor(() => hub1.hasPendingRequests())

    const file = pendingSessionsFilePath([workspace])
    await hub1.stop()
    assert.ok(fs.existsSync(file), 'pending file should exist after hub shutdown')
    const snap = readPersistedPendingSessions([workspace])
    assert.equal(snap?.sessions?.length, 1)
    assert.equal(snap.sessions[0].summary, 'Restore me after restart')

    const hub2 = new WsHub('pending-restore-it')
    hub2.setWorkspaces([workspace])
    const port2 = await hub2.start()
    assert.ok(hub2.hasPendingRequests(), 'hub should restore pending from disk')

    const webviewOut = []
    const bridge = hub2.attachWebview((msg) => webviewOut.push(msg))
    bridge.deliver(JSON.stringify({ type: 'register', clientType: 'webview' }))
    await waitFor(() => webviewOut.some((m) => m.type === 'session_updated'))

    const updated = webviewOut.find((m) => m.type === 'session_updated')
    assert.equal(updated.summary, 'Restore me after restart')
    assert.ok(updated.session_id)

    await hub2.stop()
    mcp.close()
    bridge.dispose()
  })
})

describe('pendingSessionStore TTL', () => {
  it('isPersistedSessionExpired respects max age', () => {
    const now = Date.now()
    assert.equal(
      isPersistedSessionExpired({ id: 'fb-old', summary: 'q', enqueuedAt: now - 90_000_000 }, now, 86_400_000),
      true,
    )
    assert.equal(
      isPersistedSessionExpired({ id: 'fb-new', summary: 'q', enqueuedAt: now - 60_000 }, now, 86_400_000),
      false,
    )
  })
})
