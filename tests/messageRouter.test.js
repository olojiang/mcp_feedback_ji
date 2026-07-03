import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { routeHubMessage } = require('../out/server/messageRouter.js')

function createDeps() {
  const errors = []
  const feedbackRequests = []
  const feedbackResponses = []
  const deps = {
    onRegister: () => {},
    onFeedbackRequest: (_ws, req) => feedbackRequests.push(req),
    onFeedbackResponse: (res) => feedbackResponses.push(res),
    onQueuePending: () => {},
    onDismiss: () => {},
    onGetState: () => {},
    sendPong: () => {},
    onProtocolError: (ctx) => errors.push(ctx),
  }
  return { deps, errors, feedbackRequests, feedbackResponses }
}

describe('messageRouter pipeline isolation', () => {
  it('rejects feedback_request from webview client', () => {
    const { deps, errors, feedbackRequests } = createDeps()
    const client = { clientType: 'webview', lastPong: Date.now() }
    routeHubMessage(null, client, {
      type: 'feedback_request',
      summary: 'hack from panel',
    }, deps)
    assert.equal(feedbackRequests.length, 0)
    assert.ok(errors.some((e) => e.includes('pipeline_reject:mcp→hub:feedback_request')))
  })

  it('accepts feedback_request from mcp-server client', () => {
    const { deps, errors, feedbackRequests } = createDeps()
    const client = { clientType: 'mcp-server', lastPong: Date.now() }
    routeHubMessage(null, client, {
      type: 'feedback_request',
      summary: 'Agent question',
      project_directory: '/proj',
    }, deps)
    assert.equal(errors.length, 0)
    assert.equal(feedbackRequests.length, 1)
    assert.equal(feedbackRequests[0].summary, 'Agent question')
  })

  it('accepts feedback_request from unknown client (pre-register race)', () => {
    const { deps, errors, feedbackRequests } = createDeps()
    const client = { clientType: 'unknown', lastPong: Date.now() }
    routeHubMessage(null, client, {
      type: 'feedback_request',
      summary: 'Early request',
    }, deps)
    assert.equal(errors.length, 0)
    assert.equal(feedbackRequests.length, 1)
  })

  it('rejects feedback_response from mcp-server client', () => {
    const { deps, errors, feedbackResponses } = createDeps()
    const client = { clientType: 'mcp-server', lastPong: Date.now() }
    routeHubMessage(null, client, {
      type: 'feedback_response',
      feedback: 'wrong hop',
      session_id: 'fb-x',
    }, deps)
    assert.equal(feedbackResponses.length, 0)
    assert.ok(errors.some((e) => e.includes('pipeline_reject:ui→hub:feedback_response')))
  })

  it('accepts feedback_response from webview client', () => {
    const { deps, errors, feedbackResponses } = createDeps()
    const client = { clientType: 'webview', lastPong: Date.now() }
    routeHubMessage(null, client, {
      type: 'feedback_response',
      feedback: 'User reply',
      session_id: 'fb-x',
    }, deps)
    assert.equal(errors.length, 0)
    assert.equal(feedbackResponses.length, 1)
    assert.equal(feedbackResponses[0].feedback, 'User reply')
  })

  it('routes dismiss_feedback, get_state, ping, and session_displayed', () => {
    let dismissed = false
    let stateRequested = false
    let ponged = false
    let displayed = ''
    const client = { clientType: 'webview', lastPong: 0 }
    const deps = {
      onRegister: () => {},
      onFeedbackRequest: () => {},
      onFeedbackResponse: () => {},
      onQueuePending: () => {},
      onDismiss: () => { dismissed = true },
      onGetState: () => { stateRequested = true },
      onSessionDisplayed: (sid) => { displayed = sid },
      sendPong: () => { ponged = true },
      onProtocolError: () => {},
    }
    routeHubMessage(null, client, { type: 'dismiss_feedback' }, deps)
    routeHubMessage(null, client, { type: 'get_state' }, deps)
    routeHubMessage(null, client, { type: 'ping' }, deps)
    routeHubMessage(null, client, { type: 'session_displayed', session_id: 'fb-ack' }, deps)
    assert.equal(dismissed, true)
    assert.equal(stateRequested, true)
    assert.equal(ponged, true)
    assert.equal(displayed, 'fb-ack')
    assert.ok(client.lastPong > 0)
  })

  it('reports protocol_error for invalid register and unknown message types', () => {
    const { deps, errors } = createDeps()
    const client = { clientType: 'unknown', lastPong: Date.now() }
    routeHubMessage(null, client, { type: 'register', clientType: 'hacker' }, deps)
    routeHubMessage(null, client, { type: 'totally_unknown' }, deps)
    assert.ok(errors.includes('register'))
    assert.ok(errors.includes('unknown_message_type'))
  })

  it('passes project_directory through feedback_response validation', () => {
    const { deps, feedbackResponses } = createDeps()
    const client = { clientType: 'webview', lastPong: Date.now() }
    routeHubMessage(null, client, {
      type: 'feedback_response',
      feedback: 'ok',
      session_id: 'fb-1',
      project_directory: '/proj',
    }, deps)
    assert.equal(feedbackResponses[0].project_directory, '/proj')
  })
})
