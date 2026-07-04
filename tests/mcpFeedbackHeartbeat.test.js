import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

describe('requestFeedback wait heartbeat', () => {
  afterEach(() => {
    mock.timers.reset()
  })

  it('logs feedback_wait_heartbeat with logarithmic throttle', async () => {
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

    const heartbeats = () => logs.filter(l => /event=feedback_wait_heartbeat/.test(l))

    // tick 1: should log heartbeat
    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(heartbeats().length, 1)
    assert.match(heartbeats()[0], /trace=trace-hb-1/)

    // tick 2: should log heartbeat
    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(heartbeats().length, 2)

    // tick 3: should NOT log heartbeat (logarithmic throttle skips tick 3)
    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(heartbeats().length, 2)

    ws.emit('message', Buffer.from(JSON.stringify({ type: 'feedback_result', feedback: 'done' })))
    await pending
    // after resolve, no new heartbeats should appear
    const countAfterResolve = heartbeats().length
    mock.timers.tick(FEEDBACK_WAIT_HEARTBEAT_MS)
    assert.equal(heartbeats().length, countAfterResolve)
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
