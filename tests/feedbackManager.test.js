import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FeedbackManager } = require('../out/server/feedbackManager.js')

describe('FeedbackManager', () => {
  it('rebroadcast path: updateTransport returns same sessionId and updates summary', async () => {
    const fm = new FeedbackManager()
    const ws1 = { id: 'ws1' }
    const ws2 = { id: 'ws2' }
    const project = '/Users/hunter/Workspace/mcp_feedback_ji'

    const first = fm.enqueue(ws1, project, 'first summary')
    assert.ok(first.sessionId)

    const transport = fm.updateTransport(ws2, project, 'second summary')
    assert.equal(transport.updated, true)
    assert.equal(transport.sessionId, first.sessionId)
    assert.equal(fm.pendingCount(), 1)

    assert.equal(fm.resolveBySessionId(first.sessionId, { feedback: 'ok' }), true)
    const resolved = await first.promise
    assert.equal(resolved.transport, ws2)
    assert.equal(resolved.feedback, 'ok')
  })

  it('updateTransport without matching project returns not updated', () => {
    const fm = new FeedbackManager()
    fm.enqueue({ id: 'ws' }, '/other', 'x')
    const transport = fm.updateTransport({ id: 'ws2' }, '/missing', 'y')
    assert.equal(transport.updated, false)
  })
})
