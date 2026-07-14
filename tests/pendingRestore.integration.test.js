import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createRequire } from 'node:module'
import { WebSocket } from 'ws'
import { installIsolatedConfig } from './helpers/isolatedConfig.js'

const require = createRequire(import.meta.url)
const isolatedRoot = installIsolatedConfig('mcp-pending-restore-')
const { WsHub } = require('../out/server/wsHub.js')
const {
  pendingSessionsFilePath,
  readPersistedPendingSessions,
  isPersistedSessionExpired,
} = require('../out/pendingSessionStore.js')
const { flushHubLog } = require('../out/extensionFileLog.js')
const { getLogsDir, getConfigDir } = require('../out/configPaths.js')

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
  it('writes hub logs under isolated config dir, not live ~/.config', async () => {
    assert.equal(getConfigDir(), path.resolve(isolatedRoot))
    const logsDir = getLogsDir()
    assert.ok(logsDir.startsWith(path.resolve(isolatedRoot)))
    assert.ok(!logsDir.includes(path.join(os.homedir(), '.config', 'mcp-feedback-enhanced')))

    const workspace = path.join(isolatedRoot, 'log-isolation-ws')
    fs.mkdirSync(workspace, { recursive: true })
    const hub = new WsHub('pending-restore-log-isolation')
    hub.setWorkspaces([workspace])
    const port = await hub.start()
    flushHubLog()

    const today = new Date()
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const logFile = path.join(logsDir, `extension-${key}.log`)
    assert.ok(fs.existsSync(logFile), `expected isolated log at ${logFile}`)
    const body = fs.readFileSync(logFile, 'utf8')
    assert.match(body, /pending-restore-log-isolation/)
    assert.match(body, new RegExp(`port=${port}`))

    await hub.stop()
  })

  it('hub stop/start restores pending session and replays to webview', async () => {
    const workspace = path.join(isolatedRoot, 'pending-restore-ws')
    fs.mkdirSync(workspace, { recursive: true })
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
    await hub2.start()
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

  it('webview dismiss of a restored detached session clears persisted pending', async () => {
    const workspace = path.join(isolatedRoot, 'pending-restore-dismiss-ws')
    fs.mkdirSync(workspace, { recursive: true })
    const hub1 = new WsHub('pending-restore-dismiss-it')
    hub1.setWorkspaces([workspace])
    const port1 = await hub1.start()

    const mcp = new WebSocket(`ws://127.0.0.1:${port1}`)
    await waitOpen(mcp)
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    mcp.send(JSON.stringify({
      type: 'feedback_request',
      summary: 'Dismiss restored pending',
      project_directory: workspace,
      trace_id: 'trace-restore-dismiss-1',
    }))
    await waitFor(() => hub1.hasPendingRequests())
    await hub1.stop()

    const hub2 = new WsHub('pending-restore-dismiss-it')
    hub2.setWorkspaces([workspace])
    await hub2.start()
    assert.ok(hub2.hasPendingRequests(), 'hub should restore pending from disk')

    const webviewOut = []
    const bridge = hub2.attachWebview((msg) => webviewOut.push(msg))
    bridge.deliver(JSON.stringify({ type: 'register', clientType: 'webview' }))
    const updated = await waitFor(() => webviewOut.find((m) => m.type === 'session_updated'))

    bridge.deliver(JSON.stringify({ type: 'dismiss_feedback', session_id: updated.session_id }))
    await waitFor(() => !hub2.hasPendingRequests())

    assert.equal(readPersistedPendingSessions([workspace]), null)

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
