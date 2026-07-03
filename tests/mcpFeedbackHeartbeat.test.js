import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

describe('requestFeedback wait heartbeat', () => {
  afterEach(() => {
    mock.timers.reset()
  })

  it('logs feedback_wait_heartbeat every 60s while waiting', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })

    const {
      requestFeedback,
      FEEDBACK_WAIT_HEARTBEAT_MS,
    } = await import('../mcp-server/dist/extensionClient.js')

    const logs = []
    const ws = new EventEmitter()
    ws.send = () => {}
    ws.off = ws.removeListener.bind(ws)
    ws.readyState = 1

    const pending = requestFeedback(
      ws,
      'slow test',
      '/tmp/proj',
      'trace-hb-1',
      { log: (msg) => logs.push(msg), heartbeatMs: FEEDBACK_WAIT_HEARTBEAT_MS },
    )

    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(logs.length, 1)
    assert.match(logs[0], /event=feedback_wait_heartbeat/)
    assert.match(logs[0], /trace=trace-hb-1/)

    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(logs.length, 2)

    ws.emit('message', Buffer.from(JSON.stringify({ type: 'feedback_result', feedback: 'done' })))
    await pending
    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(logs.length, 2)
  })
})

describe('feedbackWaitHeartbeatLine', () => {
  it('formats stable log line', async () => {
    const { feedbackWaitHeartbeatLine } = await import('../mcp-server/dist/feedbackWait.js')
    assert.equal(
      feedbackWaitHeartbeatLine('t-9', '/ws'),
      'event=feedback_wait_heartbeat trace=t-9 project=/ws',
    )
  })
})
