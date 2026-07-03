import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

describe('requestFeedback stdio keepalive', () => {
  afterEach(() => {
    mock.timers.reset()
  })

  it('fires onWaitTick immediately and every stdioKeepaliveMs', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })

    const { requestFeedback, STDIO_KEEPALIVE_MS } = await import('../mcp-server/dist/extensionClient.js')

    const ticks = []
    const ws = new EventEmitter()
    ws.send = () => {}
    ws.off = ws.removeListener.bind(ws)
    ws.readyState = 1

    const pending = requestFeedback(ws, 'wait', '/proj', 'trace-stdio', {
      onWaitTick: () => ticks.push(Date.now()),
      stdioKeepaliveMs: STDIO_KEEPALIVE_MS,
      heartbeatMs: 60_000,
      log: () => {},
    })

    assert.equal(ticks.length, 1)

    mock.timers.tick(STDIO_KEEPALIVE_MS)
    assert.equal(ticks.length, 2)

    mock.timers.tick(STDIO_KEEPALIVE_MS)
    assert.equal(ticks.length, 3)

    ws.emit('message', Buffer.from(JSON.stringify({ type: 'feedback_result', feedback: 'ok' })))
    await pending

    mock.timers.tick(STDIO_KEEPALIVE_MS)
    assert.equal(ticks.length, 3)
  })
})

describe('createStdioKeepaliveTick', () => {
  it('sends logging notification with heartbeat line', async () => {
    const { createStdioKeepaliveTick } = await import('../mcp-server/dist/stdioKeepalive.js')
    const sent = []
    const tick = createStdioKeepaliveTick({
      sendLoggingMessage: async (params) => {
        sent.push(params)
      },
    })

    tick('trace-1', '/ws')
    await Promise.resolve()

    assert.equal(sent.length, 1)
    assert.equal(sent[0].level, 'info')
    assert.match(sent[0].data, /event=feedback_wait_heartbeat trace=trace-1/)
  })
})
