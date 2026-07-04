import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { WebSocket } from 'ws'

const require = createRequire(import.meta.url)

describe('P5-1 clipboardPort', () => {
  it('createClipboardHandlers uses injected port without vscode', async () => {
    const { createClipboardHandlers } = require('../out/server/clipboardHandlers.js')
    const writes = []
    const reads = []
    const handlers = createClipboardHandlers({
      clipboard: {
        writeText: async (t) => { writes.push(t) },
        readText: async () => 'mock-text',
      },
      readImageBase64: async () => null,
      log: () => {},
      send: (_ws, msg) => reads.push(msg),
    })
    const ws = {}
    await handlers.onClipboardWrite(ws, { text: 'copy-me' })
    assert.deepEqual(writes, ['copy-me'])
    const ok = reads.find((m) => m.type === 'clipboard_write_ok')
    assert.ok(ok)

    reads.length = 0
    await handlers.onClipboardPaste(ws, { request_id: 'r1' })
    const res = reads.find((m) => m.type === 'clipboard_paste_result')
    assert.equal(res.text, 'mock-text')
    assert.equal(res.request_id, 'r1')
  })

  it('WsHub accepts clipboard port in constructor', async () => {
    const { WsHub } = require('../out/server/wsHub.js')
    const sent = []
    const hub = new WsHub('clip-test', {
      clipboard: {
        writeText: async () => {},
        readText: async () => 'injected',
      },
      readImageBase64: async () => null,
    })
    hub.setWorkspaces(['/tmp/clip-test'])
    const port = await hub.start()
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    const replies = []
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    ws.on('message', (raw) => replies.push(JSON.parse(raw.toString())))
    ws.send(JSON.stringify({ type: 'register', clientType: 'webview' }))
    ws.send(JSON.stringify({ type: 'clipboard_paste', request_id: 'inj' }))
    await new Promise((r) => setTimeout(r, 200))
    const res = replies.find((m) => m.type === 'clipboard_paste_result')
    assert.equal(res?.text, 'injected')
    ws.close()
    await hub.stop()
    assert.equal(sent.length, 0)
  })
})

describe('P5-2 deploy hooks and rules', () => {
  it('planHooksConfigUpdate merges preToolUse and stop, strips legacy', () => {
    const { planHooksConfigUpdate, applyHooksConfigPlan, SOURCE_TAG } = require('../out/deploy/hooks.js')
    const input = {
      version: 1,
      hooks: {
        preToolUse: [{ command: 'old', _source: SOURCE_TAG }],
        stop: [{ command: 'old-stop', _source: SOURCE_TAG }],
      },
    }
    const plan = planHooksConfigUpdate('/node', '/hook/consume-pending.js', input)
    assert.equal(plan.changed, true)
    const next = applyHooksConfigPlan(input, plan)
    assert.match(next.hooks.preToolUse[0].command, /consume-pending\.js/)
    assert.equal(next.hooks.stop, undefined, 'stop hook should be retired (causes followup_message loop)')
  })

  it('planRulesDeploy skips write when content unchanged', () => {
    const { RULES_CONTENT, planRulesDeploy } = require('../out/deploy/rules.js')
    const plan = planRulesDeploy(RULES_CONTENT, ['/ws/a'])
    assert.equal(plan.writeGlobal, false)
    assert.equal(plan.removeWorkspaceRules.length, 1)
    assert.match(plan.removeWorkspaceRules[0], /mcp-feedback-enhanced\.mdc$/)
  })

  it('planPendingMigration removes empty pending dir', () => {
    const { planPendingMigration } = require('../out/deploy/pendingMigration.js')
    const plan = planPendingMigration([])
    assert.equal(plan.removeDir, true)
    const plan2 = planPendingMigration(['a.json'])
    assert.equal(plan2.removeDir, false)
    assert.equal(plan2.unlinkFiles.length, 1)
  })
})

describe('P6-4 state sync deeper incremental', () => {
  it('omits unchanged pending_sessions and hub on incremental sync', () => {
    const {
      pendingSessionsFingerprint,
      hubFingerprint,
      buildStateSyncPayload,
    } = require('../out/stateSyncPayload.js')
    const sessions = [{ id: 's1', label: 'a', summary: 'hi', waiting: true }]
    const hub = { port: 48201, pending_count: 1, mcp_servers: 1 }
    const fpS = pendingSessionsFingerprint(sessions)
    const fpH = hubFingerprint(hub)

    const inc = buildStateSyncPayload({
      messages: [],
      syncGeneration: 2,
      pendingComments: [],
      pendingImages: [],
      feedbackQueueSize: 1,
      pendingSessions: sessions,
      hub,
      lastPendingFingerprint: fpS,
      lastHubFingerprint: fpH,
    })
    assert.equal(inc.incremental, true)
    assert.equal(inc.pending_sessions_unchanged, true)
    assert.equal(inc.hub_unchanged, true)
    assert.equal(inc.pending_sessions, undefined)
    assert.equal(inc.hub, undefined)
  })

  it('PanelState keeps pending sessions when pending_sessions_unchanged', () => {
    const { PanelState } = require('../out/webview/panelState.js')
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [{
        id: 'fb-1',
        label: 't',
        summary: 'First',
        waiting: true,
      }],
      hub: { workspaces: ['/proj'] },
    })
    const cmds = state.handleMessage({
      type: 'state_sync',
      incremental: true,
      pending_sessions_unchanged: true,
      hub_unchanged: true,
      pending_comments: [],
      pending_images: [],
    })
    assert.ok(cmds.some((c) => c.type === 'render'))
    assert.equal(state.sessions['fb-1'].messages.length, 1)
  })
})

describe('P7-6 extension helpers smoke', () => {
  it('workspacesFromFolders maps vscode folder shape', () => {
    const { workspacesFromFolders } = require('../out/extensionHelpers.js')
    assert.deepEqual(
      workspacesFromFolders([{ uri: { fsPath: '/a' } }, { uri: { fsPath: '/b' } }]),
      ['/a', '/b'],
    )
  })

  it('substituteWebviewPlaceholders replaces tokens', () => {
    const { substituteWebviewPlaceholders } = require('../out/extensionHelpers.js')
    const html = '<div>{{SERVER_URL}}</div>{{VERSION}}'
    const out = substituteWebviewPlaceholders(html, {
      SERVER_URL: 'ws://127.0.0.1:1',
      VERSION: '2.5.1-ji.69',
      PROJECT_PATH: '/p',
    })
    assert.match(out, /ws:\/\/127\.0\.0\.1:1/)
    assert.match(out, /2\.5\.1-ji\.69/)
  })

  it('scheduleReminderDelays fires at configured offsets', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const { scheduleReminderDelays } = require('../out/feedbackReminders.js')
    const fired = []
    scheduleReminderDelays([0, 100], (delay) => fired.push(delay))
    mock.timers.tick(0)
    mock.timers.tick(100)
    assert.deepEqual(fired, [0, 100])
    mock.timers.reset()
  })
})
