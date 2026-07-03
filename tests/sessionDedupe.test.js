import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { FeedbackManager } = require('../out/server/feedbackManager.js')
const { FeedbackFlow } = require('../out/server/feedbackFlow.js')
const { DUPLICATE_FEEDBACK_SUPERSEDED_MSG } = require('../out/feedbackSuperseded.js')

const TRACE = 'cursor-trace-dedupe-test'
const PROJECT = '/Users/hunter/Workspace/mcp_feedback_ji'

function createFlow() {
  const feedback = new FeedbackManager()
  const logs = []
  const errors = []
  const flow = new FeedbackFlow({
    feedback,
    getHubWorkspaces: () => [PROJECT],
    appendReminder: (t) => t,
    addMessage: () => {},
    broadcastSessionUpdated: () => {},
    broadcastFeedbackSubmitted: () => {},
    clearPending: () => {},
    queueAsPending: () => {},
    sendResult: () => {},
    sendError: (ws, err) => { errors.push({ ws, message: err.message }) },
    log: (msg) => logs.push(msg),
    getHubMeta: () => ({ port: 48201, pid: 1 }),
  })
  return { flow, feedback, logs, errors }
}

describe('session dedupe — waste prevention', () => {
  it('storm: 5 parallel same-trace requests → 1 pending tab', () => {
    const { flow, feedback } = createFlow()
    const wss = Array.from({ length: 5 }, (_, i) => ({ id: `ws${i}`, readyState: 1 }))

    for (let i = 0; i < wss.length; i++) {
      flow.handleFeedbackRequest(wss[i], {
        summary: `Call ${i}`,
        project_directory: PROJECT,
        trace_id: TRACE,
      })
    }

    assert.equal(feedback.pendingCount(), 1, 'must not create 5 tabs for same trace')
  })

  it('storm: releases superseded MCP waits with explicit error (no 24h hang)', () => {
    const { flow, errors } = createFlow()
    const ws1 = { id: 'ws1', readyState: 1 }
    const ws2 = { id: 'ws2', readyState: 1 }

    flow.handleFeedbackRequest(ws1, {
      summary: 'First',
      project_directory: PROJECT,
      trace_id: TRACE,
    })
    flow.handleFeedbackRequest(ws2, {
      summary: 'Second duplicate',
      project_directory: PROJECT,
      trace_id: TRACE,
    })

    assert.equal(errors.length, 1)
    assert.equal(errors[0].ws, ws1)
    assert.match(errors[0].message, /superseded/)
    assert.equal(errors[0].message, DUPLICATE_FEEDBACK_SUPERSEDED_MSG)
  })

  it('duplicate feedback_request on same mcp ws sends already_pending result (no second tab)', () => {
    const feedback = new FeedbackManager()
    const logs = []
    const results = []
    const flow = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => [PROJECT],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: (ws, result) => { results.push({ ws, result }) },
      sendError: (ws, err) => {},
      log: (msg) => logs.push(msg),
      getHubMeta: () => ({ port: 48201, pid: 1 }),
    })
    const ws = { id: 'ws1', readyState: 1 }

    flow.handleFeedbackRequest(ws, {
      summary: 'Once',
      project_directory: PROJECT,
      trace_id: TRACE,
    })
    flow.handleFeedbackRequest(ws, {
      summary: 'Twice same ws',
      project_directory: PROJECT,
      trace_id: TRACE,
    })

    assert.equal(feedback.pendingCount(), 1)
    assert.ok(logs.some((l) => l.includes('already_pending')))
    assert.ok(logs.some((l) => l.includes('trace_duplicate_blocked')))
    assert.equal(results.length, 1)
    assert.equal(results[0].result.status, 'already_pending')
    assert.equal(results[0].result.feedback, '')
  })

  it('different trace same project → legitimate parallel tabs (2 pending)', () => {
    const { flow, feedback } = createFlow()
    const ws1 = { readyState: 1 }
    const ws2 = { readyState: 1 }

    flow.handleFeedbackRequest(ws1, {
      summary: 'Agent A',
      project_directory: PROJECT,
      trace_id: 'trace-a',
    })
    flow.handleFeedbackRequest(ws2, {
      summary: 'Agent B',
      project_directory: PROJECT,
      trace_id: 'trace-b',
    })

    assert.equal(feedback.pendingCount(), 2)
  })

  it('resolve clears pending so next same trace creates fresh tab', () => {
    const { flow, feedback } = createFlow()
    const ws1 = { readyState: 1 }
    const ws2 = { readyState: 1 }

    flow.handleFeedbackRequest(ws1, {
      summary: 'Round 1',
      project_directory: PROJECT,
      trace_id: TRACE,
    })
    const sid = feedback.pendingSessions()[0].id
    flow.handleFeedbackResponse({ session_id: sid, feedback: 'Done', images: [] })
    assert.equal(feedback.pendingCount(), 0)

    flow.handleFeedbackRequest(ws2, {
      summary: 'Round 2',
      project_directory: PROJECT,
      trace_id: TRACE,
    })
    assert.equal(feedback.pendingCount(), 1)
    assert.notEqual(feedback.pendingSessions()[0].id, sid)
  })
})

describe('FeedbackManager reuseByTraceId edge cases', () => {
  it('returns duplicate when same ws sends again', () => {
    const fm = new FeedbackManager()
    const ws = { readyState: 1 }
    fm.enqueue(ws, PROJECT, 'q', TRACE)
    const r = fm.reuseByTraceId(ws, TRACE, 'q2')
    assert.equal(r.action, 'duplicate')
  })

  it('returns supersededWs on steal', () => {
    const fm = new FeedbackManager()
    const ws1 = { readyState: 1 }
    const ws2 = { readyState: 1 }
    fm.enqueue(ws1, PROJECT, 'q', TRACE)
    const r = fm.reuseByTraceId(ws2, TRACE, 'q2')
    assert.equal(r.action, 'steal')
    assert.equal(r.supersededWs, ws1)
  })
})
