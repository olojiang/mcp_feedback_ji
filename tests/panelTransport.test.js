import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  OutboundQueue,
  BridgeSessionGate,
  transportSendWithQueue,
} = require('../out/webview/panelState.js')

describe('panel transport send + queue', () => {
  it('queues when transport is down and sends after bridge ready', () => {
    const gate = new BridgeSessionGate()
    const queue = new OutboundQueue()
    const sent = []

    transportSendWithQueue(
      { type: 'feedback_response', feedback: 'Continue' },
      () => gate.isReady(),
      (m) => { sent.push(m) },
      (m) => { queue.enqueue(m) },
    )
    assert.equal(sent.length, 0)
    assert.equal(queue.size, 1)

    gate.onBridgeConnected()
    const pending = queue.drain()
    for (const msg of pending) {
      transportSendWithQueue(
        msg,
        () => gate.isReady(),
        (m) => { sent.push(m) },
        (m) => { queue.enqueue(m) },
      )
    }
    assert.deepEqual(sent, [{ type: 'feedback_response', feedback: 'Continue' }])
  })

  it('sends immediately when transport is ready', () => {
    const gate = new BridgeSessionGate()
    gate.onBridgeConnected()
    const queue = new OutboundQueue()
    const sent = []

    const ok = transportSendWithQueue(
      { type: 'ping' },
      () => gate.isReady(),
      (m) => { sent.push(m) },
      (m) => { queue.enqueue(m) },
    )
    assert.equal(ok, true)
    assert.deepEqual(sent, [{ type: 'ping' }])
    assert.equal(queue.size, 0)
  })

  it('concurrent queued messages preserve FIFO after reconnect', () => {
    const gate = new BridgeSessionGate()
    const queue = new OutboundQueue()
    const sent = []
    const send = (m) => sent.push(m)
    const enqueue = (m) => queue.enqueue(m)
    const ready = () => gate.isReady()

    transportSendWithQueue({ type: 'a' }, ready, send, enqueue)
    transportSendWithQueue({ type: 'b' }, ready, send, enqueue)
    transportSendWithQueue({ type: 'feedback_response', feedback: 'x' }, ready, send, enqueue)
    assert.equal(queue.size, 3)

    gate.onBridgeConnected()
    for (const msg of queue.drain()) {
      transportSendWithQueue(msg, ready, send, enqueue)
    }
    assert.deepEqual(sent.map((m) => m.type), ['a', 'b', 'feedback_response'])
  })

  it('outbound queue drops non-feedback before feedback_response when full', () => {
    const queue = new OutboundQueue(2)
    queue.enqueue({ type: 'ping' })
    queue.enqueue({ type: 'status_update' })
    const size = queue.enqueue({ type: 'feedback_response', feedback: 'hello' })
    assert.equal(size, 2)
    const drained = queue.drain()
    assert.equal(drained.length, 2)
    assert.ok(drained.some((m) => m.type === 'feedback_response'))
    assert.ok(!drained.some((m) => m.type === 'status_update'))
  })

  it('bridge reconnect after init triggers stateSync', () => {
    const gate = new BridgeSessionGate()
    const first = gate.onBridgeConnected()
    assert.equal(first.stateSync, true)
    gate.resetForReconnect()
    const second = gate.onBridgeConnected()
    assert.equal(second.stateSync, true)
    assert.equal(second.register, false)
  })
})
