import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FeedbackManager } = require('../out/server/feedbackManager.js')

describe('FeedbackManager', () => {
  it('rebroadcast path: updateTransport returns same sessionId when old ws is closed', async () => {
    const fm = new FeedbackManager()
    const ws1 = { id: 'ws1', readyState: 3 }
    const ws2 = { id: 'ws2', readyState: 1 }
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

  it('updateTransport does not reuse session while old mcp ws is still open', () => {
    const fm = new FeedbackManager()
    const ws1 = { id: 'ws1', readyState: 1 }
    const ws2 = { id: 'ws2', readyState: 1 }
    const project = '/Users/hunter/Workspace/mcp_feedback_ji'

    fm.enqueue(ws1, project, 'first summary')
    const transport = fm.updateTransport(ws2, project, 'second summary')
    assert.equal(transport.updated, false)
    assert.equal(fm.pendingCount(), 1)
  })

  it('updateTransport without matching project returns not updated', () => {
    const fm = new FeedbackManager()
    fm.enqueue({ id: 'ws' }, '/other', 'x')
    const transport = fm.updateTransport({ id: 'ws2' }, '/missing', 'y')
    assert.equal(transport.updated, false)
  })

  it('exposes pending sessions for webview state sync', () => {
    const fm = new FeedbackManager()
    const project = '/Users/hunter/Workspace/llm-gateway'
    const request = fm.enqueue({ id: 'ws', readyState: 1 }, project, 'Need feedback')

    assert.deepEqual(fm.pendingSessions(), [
      {
        id: request.sessionId,
        label: project,
        summary: 'Need feedback',
        projectDir: project,
        waiting: true,
      },
    ])
  })

  it('detachMcpClient marks pending sessions when mcp websocket closes', async () => {
    const fm = new FeedbackManager()
    const ws = { id: 'ws1', readyState: 3 }
    const project = '/Users/hunter/Workspace/llm-gateway'
    const request = fm.enqueue(ws, project, 'waiting')

    assert.deepEqual(fm.detachMcpClient(ws), [request.sessionId])
    assert.equal(fm.isMcpDetached(request.sessionId), true)

    assert.equal(fm.resolveBySessionId(request.sessionId, { feedback: 'late reply' }), true)
    const resolved = await request.promise
    assert.equal(resolved.feedback, 'late reply')
    assert.equal(resolved.transport, ws)
  })

  it('updateTransport clears detached flag on reconnect', () => {
    const fm = new FeedbackManager()
    const ws1 = { id: 'ws1', readyState: 3 }
    const ws2 = { id: 'ws2', readyState: 1 }
    const project = '/Users/hunter/Workspace/llm-gateway'
    const request = fm.enqueue(ws1, project, 'summary')
    fm.detachMcpClient(ws1)

    const transport = fm.updateTransport(ws2, project, 'summary')
    assert.equal(transport.updated, true)
    assert.equal(fm.isMcpDetached(request.sessionId), false)
  })

  it('tryAttachHandlers only allows one handler attachment per session', () => {
    const fm = new FeedbackManager()
    const project = '/Users/hunter/Workspace/llm-gateway'
    const request = fm.enqueue({ id: 'ws', readyState: 1 }, project, 'summary')

    assert.equal(fm.tryAttachHandlers(request.sessionId), true)
    assert.equal(fm.tryAttachHandlers(request.sessionId), false)
  })
})
