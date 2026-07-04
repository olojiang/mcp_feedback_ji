import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FeedbackFlow } = require('../out/server/feedbackFlow.js')
const { FeedbackManager } = require('../out/server/feedbackManager.js')

function createFlow(hubWorkspaces = ['/proj']) {
  const feedback = new FeedbackManager()
  const logs = []
  const flow = new FeedbackFlow({
    feedback,
    getHubWorkspaces: () => hubWorkspaces,
    appendReminder: (text) => text,
    addMessage: () => {},
    broadcastSessionUpdated: () => {},
    broadcastFeedbackSubmitted: () => {},
    clearPending: () => {},
    queueAsPending: () => {},
    sendResult: () => {},
    sendError: () => {},
    log: (msg) => logs.push(msg),
  })
  return { flow, feedback, logs }
}

describe('FeedbackFlow stale session_id fallback', () => {
  it('falls back to sole pending session when panel sends stale session_id', () => {
    const { flow, feedback, logs } = createFlow()
    const fakeWs = { readyState: 1 }
    feedback.enqueue(fakeWs, '/proj', 'Question')

    flow.handleFeedbackResponse({
      session_id: 'fb-stale-from-localStorage',
      feedback: 'Continue',
      images: [],
    })

    assert.equal(feedback.pendingCount(), 0)
    assert.ok(logs.some((line) => line.includes('stale session_id')))
  })

  it('does not guess when multiple pending sessions exist', () => {
    const { feedback, logs } = createFlow()
    const fakeWs = { readyState: 1 }
    feedback.enqueue(fakeWs, '/proj', 'First')
    feedback.enqueue(fakeWs, '/proj', 'Second')

    let queued = false
    const flow2 = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/proj'],
      appendReminder: (text) => text,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => { queued = true },
      sendResult: () => {},
      sendError: () => {},
      log: (msg) => logs.push(msg),
    })

    flow2.handleFeedbackResponse({
      session_id: 'fb-stale',
      feedback: 'Continue',
      images: [],
    })

    assert.equal(feedback.pendingCount(), 2)
    assert.equal(queued, true)
    assert.ok(logs.some((line) => line.includes('no pending session')))
  })

  it('logs pipeline trace on enqueue and response', async () => {
    const { feedback, logs } = createFlow()
    const fakeWs = { readyState: 1 }
    let sentResult = null
    const flowWithSend = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/proj'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: (_ws, result) => { sentResult = result },
      sendError: () => {},
      log: (msg) => logs.push(msg),
    })

    flowWithSend.handleFeedbackRequest(fakeWs, {
      summary: 'Trace test',
      project_directory: '/proj',
    })
    assert.ok(logs.some((l) => l.includes('pipeline: mcp→hub:feedback_request')))
    assert.ok(logs.some((l) => l.includes('pipeline: hub:enqueue') && l.includes('project=/proj')))
    assert.ok(logs.some((l) => l.includes('feedbackRequest: accepted session=') && l.includes('project=/proj')))

    const sessionId = feedback.pendingSessions()[0].id
    flowWithSend.handleFeedbackResponse({
      session_id: sessionId,
      feedback: 'Reply',
      images: [],
    })
    await new Promise((r) => setTimeout(r, 20))
    assert.ok(logs.some((l) => l.includes('pipeline: ui→hub:feedback_response')))
    assert.ok(logs.some((l) => l.includes('feedbackResponse: session=') && l.includes('project=/proj')))
    assert.equal(sentResult?.feedback, 'Reply')
  })

  it('trace steal avoids duplicate session when same trace opens second mcp ws', () => {
    const { feedback, logs } = createFlow()
    const ws1 = { readyState: 1 }
    const ws2 = { readyState: 1 }
    const trace = 'same-trace-id'

    const flow = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/proj'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: () => {},
      sendError: () => {},
      log: (msg) => logs.push(msg),
    })

    flow.handleFeedbackRequest(ws1, {
      summary: 'First',
      project_directory: '/proj',
      trace_id: trace,
    })
    flow.handleFeedbackRequest(ws2, {
      summary: 'Second',
      project_directory: '/proj',
      trace_id: trace,
    })

    assert.equal(feedback.pendingCount(), 1)
    assert.ok(logs.some((l) => l.includes('sessionLifecycle: event=trace_steal')))
    assert.ok(logs.some((l) => l.includes('feedbackRequest: trace steal')))
  })

  it('rejects feedback_request for project outside hub workspaces', () => {
    const { logs } = createFlow(['/spatial-smart-cc'])
    const fakeWs = { readyState: 1 }
    let errorMsg = ''
    const flowReject = new FeedbackFlow({
      feedback: new FeedbackManager(),
      getHubWorkspaces: () => ['/spatial-smart-cc'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: () => {},
      sendError: (_ws, err) => { errorMsg = err.message },
      log: (msg) => logs.push(msg),
    })
    flowReject.handleFeedbackRequest(fakeWs, {
      summary: 'Wrong window',
      project_directory: '/mcp_feedback_ji',
    })
    assert.match(errorMsg, /Project mismatch/)
    assert.ok(logs.some((l) => l.includes('project_mismatch')))
  })

  it('rejects feedback_response when panel sends foreign project_directory', () => {
    const { logs } = createFlow(['/spatial-smart-cc'])
    const feedback = new FeedbackManager()
    const fakeWs = { readyState: 1 }
    feedback.enqueue(fakeWs, '/spatial-smart-cc', 'Q')
    const sessionId = feedback.pendingSessions()[0].id
    const flow = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/spatial-smart-cc'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: () => {},
      sendError: () => {},
      log: (msg) => logs.push(msg),
    })
    flow.handleFeedbackResponse({
      session_id: sessionId,
      feedback: 'reply',
      project_directory: '/mcp_feedback_ji',
    })
    assert.equal(feedback.pendingCount(), 1)
    assert.ok(logs.some((l) => l.includes('feedbackResponse: rejected project_mismatch')))
  })

  it('handleDismiss resolves first pending session', () => {
    const { feedback, logs } = createFlow()
    const fakeWs = { readyState: 1 }
    let submitted = false
    const flow = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/proj'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => { submitted = true },
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: () => {},
      sendError: () => {},
      log: (msg) => logs.push(msg),
    })
    flow.handleFeedbackRequest(fakeWs, { summary: 'Q', project_directory: '/proj' })
    flow.handleDismiss()
    assert.equal(feedback.pendingCount(), 0)
    assert.equal(submitted, true)
  })

  it('queues pending when mcp transport is closed at resolve time', async () => {
    const { feedback, logs } = createFlow()
    const fakeWs = { readyState: 1 }
    let queued = false
    const flow = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/proj'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => { queued = true },
      sendResult: () => {},
      sendError: () => {},
      log: (msg) => logs.push(msg),
    })
    flow.handleFeedbackRequest(fakeWs, { summary: 'Q', project_directory: '/proj' })
    const sessionId = feedback.pendingSessions()[0].id
    fakeWs.readyState = 3
    flow.handleFeedbackResponse({ session_id: sessionId, feedback: 'late', project_directory: '/proj' })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(queued, true)
    assert.ok(logs.some((l) => l.includes('mcp gone')))
  })
})
