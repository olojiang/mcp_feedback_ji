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

  it('drops oldest entry when over capacity', () => {
    const q = new OutboundQueue(2)
    q.enqueue({ type: 'a' })
    q.enqueue({ type: 'b' })
    q.enqueue({ type: 'c' })
    assert.deepEqual(q.drain(), [{ type: 'b' }, { type: 'c' }])
  })

  it('reports whether feedback responses are queued', () => {
    const q = new OutboundQueue()
    q.enqueue({ type: 'ping' })
    assert.equal(q.hasFeedbackResponse(), false)
    q.enqueue({ type: 'feedback_response', feedback: 'ok' })
    assert.equal(q.hasFeedbackResponse(), true)
  })
})
