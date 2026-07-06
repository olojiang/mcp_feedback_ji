import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { WebSocketServer } from 'ws'

const require = createRequire(import.meta.url)
const {
  CURSOR_KEEPALIVE_MESSAGE,
  CURSOR_KEEPALIVE_TOTAL_MIN,
  CURSOR_PROGRESS_TOTAL_MIN,
  createProgressSender,
  cursorKeepaliveLogLine,
  elapsedWaitMinutes,
} = require('../mcp-server/dist/cursorKeepalive.js')
const { requestFeedback } = require('../mcp-server/dist/extensionClient.js')
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')

describe('cursorKeepalive helpers', () => {
  it('formats auto-resolve log line', () => {
    const line = cursorKeepaliveLogLine({
      traceId: 'trace-1',
      projectDirectory: '/repo',
      elapsedMs: 3_000_000,
      message: 'hello',
    })
    assert.match(line, /event=cursor_keepalive_auto_resolve/)
    assert.match(line, /trace=trace-1/)
    assert.match(line, /elapsed_ms=3000000/)
    assert.match(line, /message=hello/)
  })

  it('sends minute-based progress (e.g. 12/30)', async () => {
    const sent = []
    const logs = []
    const startedAt = Date.now() - 12 * 60_000
    const progress = createProgressSender({
      progressToken: 'tok-1',
      sendNotification: async (n) => { sent.push(n) },
      log: (m) => logs.push(m),
      intervalMs: 20,
      startedAt,
      getSessionId: () => 'fb-test-session',
      getWsReadyState: () => 1,
    })
    progress.start()
    await new Promise((r) => setTimeout(r, 30))
    progress.stop()
    assert.ok(sent.length >= 1)
    assert.equal(sent[0].params.progress, 12)
    assert.equal(sent[0].params.total, CURSOR_PROGRESS_TOTAL_MIN)
    assert.equal(elapsedWaitMinutes(startedAt), 12)
    assert.ok(logs.some((l) => String(l).includes('event=progress_send_ok')))
    assert.ok(logs.some((l) => String(l).includes('session=fb-test-session')))
    assert.ok(logs.some((l) => String(l).includes('ws_ready_state=1')))
  })

  it('logs progress_send_fail when notification rejects', async () => {
    const logs = []
    const progress = createProgressSender({
      progressToken: 'tok-2',
      sendNotification: async () => { throw new Error('cursor rejected') },
      log: (m) => logs.push(m),
      intervalMs: 20,
      startedAt: Date.now(),
    })
    progress.start()
    await new Promise((r) => setTimeout(r, 30))
    progress.stop()
    assert.ok(logs.some((l) => String(l).includes('event=progress_send_fail')))
    assert.ok(logs.some((l) => String(l).includes('error=cursor rejected')))
  })
})

describe('requestFeedback cursor keepalive', () => {
  it('auto-resolves with keepalive before user reply', async () => {
    const wss = new WebSocketServer({ port: 0 })
    const port = await new Promise((resolve) => {
      wss.on('listening', () => resolve(wss.address().port))
    })

    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'feedback_request') {
          // Deliberately do not reply — keepalive should fire.
        }
      })
    })

    const ws = await new Promise((resolve, reject) => {
      const client = new (require('ws'))(`ws://127.0.0.1:${port}`)
      client.once('open', () => resolve(client))
      client.once('error', reject)
    })

    const logs = []
    const result = await requestFeedback(ws, 'summary', '/repo', 'trace-1', {
      log: (m) => logs.push(m),
      heartbeatMs: 1_000_000,
      stdioKeepaliveMs: 1_000_000,
      cursorKeepaliveMs: 80,
      cursorKeepaliveMessage: 'hello',
    })

    assert.equal(result.status, 'keepalive')
    assert.equal(result.feedback, 'hello')
    assert.ok(logs.some((l) => String(l).includes('event=cursor_keepalive_auto_resolve')))

    ws.close()
    await new Promise((r) => wss.close(r))
  })
})

describe('toolHandlers keepalive status', () => {
  it('returns keepalive instruction without treating placeholder as user input', async () => {
    const logs = []
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {}, on() {}, send() {}, off() {} }),
      requestFeedback: async () => ({ status: 'keepalive', feedback: CURSOR_KEEPALIVE_MESSAGE }),
      browserFallback: async () => 'browser',
      log: (m) => logs.push(m),
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'wait' })
    assert.match(result.content[0].text, /\[keepalive\]/)
    assert.match(result.content[0].text, /End your turn immediately/)
    assert.match(result.content[0].text, /Do NOT call interactive_feedback again/)
    assert.ok(logs.some((l) => String(l).includes('request_waste_guard')))
  })
})
