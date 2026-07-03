/**
 * Integration: stdio keepalive ticks survive 35s wait (mock timers).
 * Nightly real-time variant: MCP_STDIO_SLOW_TESTS=1
 */
import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const SLOW = process.env.MCP_STDIO_SLOW_TESTS === '1'

describe('stdio keepalive 35s wait', () => {
  afterEach(() => {
    mock.timers.reset()
  })

  it('fires at least 4 keepalive ticks within 35s', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })

    const { requestFeedback, STDIO_KEEPALIVE_MS } = await import('../mcp-server/dist/extensionClient.js')
    const ticks = []
    const ws = new EventEmitter()
    ws.send = () => {}
    ws.off = ws.removeListener.bind(ws)
    ws.readyState = 1

    const pending = requestFeedback(ws, 'slow', '/proj', 'trace-35', {
      onWaitTick: () => ticks.push('tick'),
      stdioKeepaliveMs: STDIO_KEEPALIVE_MS,
      heartbeatMs: 60_000,
      log: () => {},
    })

    mock.timers.tick(35_000)
    assert.ok(ticks.length >= 4, 'expected >=4 ticks in 35s, got ' + ticks.length)

    ws.emit('message', Buffer.from(JSON.stringify({ type: 'feedback_result', feedback: 'ok' })))
    await pending
  })
})

describe('stdio keepalive 35s real time', { skip: !SLOW, timeout: 45_000 }, () => {
  it('waits 35s without rejecting when onWaitTick is set', async () => {
    const { requestFeedback } = await import('../mcp-server/dist/extensionClient.js')
    const ws = new EventEmitter()
    ws.send = () => {}
    ws.off = ws.removeListener.bind(ws)
    ws.readyState = 1

    let ticks = 0
    const pending = requestFeedback(ws, 'real slow', '/proj', 'trace-real', {
      onWaitTick: () => { ticks++ },
      log: () => {},
    })

    await new Promise((r) => setTimeout(r, 35_000))
    assert.ok(ticks >= 3, 'ticks=' + ticks)
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'feedback_result', feedback: 'done' })))
    await pending
  })
})
