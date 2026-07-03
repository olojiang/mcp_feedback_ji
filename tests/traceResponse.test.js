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

describe('trace_id on feedback response path', () => {
  it('logs trace on feedbackResponse when session had trace_id', () => {
    const { flow, feedback, logs } = createFlow()
    const fakeWs = { readyState: 1 }

    flow.handleFeedbackRequest(fakeWs, {
      summary: 'Need input',
      project_directory: '/proj',
      trace_id: 'trace-return-7',
    })

    const sessionId = feedback.pendingSessions()[0].id
    flow.handleFeedbackResponse({
      session_id: sessionId,
      feedback: 'Done',
    })

    assert.ok(logs.some((l) => l.includes('feedbackResponse:') && l.includes('trace=trace-return-7')))
  })
})
