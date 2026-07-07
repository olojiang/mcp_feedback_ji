import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { OutboundQueue } = require('../out/webview/panelState.js')

describe('OutboundQueue', () => {
  it('drains messages in FIFO order', () => {
    const q = new OutboundQueue()
    q.enqueue({ type: 'ping' })
    q.enqueue({ type: 'feedback_response', feedback: 'Continue' })
    assert.equal(q.size, 2)
    assert.deepEqual(q.drain(), [
      { type: 'ping' },
      { type: 'feedback_response', feedback: 'Continue' },
    ])
    assert.equal(q.size, 0)
  })

  it('drops newest non-feedback when over capacity', () => {
    const q = new OutboundQueue(2)
    q.enqueue({ type: 'a' })
    q.enqueue({ type: 'b' })
    q.enqueue({ type: 'c' })
    assert.deepEqual(q.drain(), [{ type: 'a' }, { type: 'c' }])
  })

  it('keeps feedback_response when queue is full', () => {
    const q = new OutboundQueue(2)
    q.enqueue({ type: 'ping' })
    q.enqueue({ type: 'status_update' })
    q.enqueue({ type: 'feedback_response', feedback: 'hello' })
    const drained = q.drain()
    assert.equal(drained.length, 2)
    assert.ok(drained.some((m) => m.type === 'feedback_response'))
    assert.ok(!drained.some((m) => m.type === 'status_update'))
  })

  it('reports whether feedback responses are queued', () => {
    const q = new OutboundQueue()
    q.enqueue({ type: 'ping' })
    assert.equal(q.hasFeedbackResponse(), false)
    q.enqueue({ type: 'feedback_response', feedback: 'ok' })
    assert.equal(q.hasFeedbackResponse(), true)
  })

  it('serializes queued feedback_response so a refresh can resend it', () => {
    const q = new OutboundQueue()
    q.enqueue({ type: 'ping' })
    q.enqueue({ type: 'feedback_response', session_id: 'fb-1', feedback: 'pending reply' })

    const restored = new OutboundQueue()
    restored.restore(q.snapshot())

    assert.deepEqual(restored.drain(), [
      { type: 'ping' },
      { type: 'feedback_response', session_id: 'fb-1', feedback: 'pending reply' },
    ])
  })
})
