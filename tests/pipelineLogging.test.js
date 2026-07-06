import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { WebSocketServer } from 'ws'

const require = createRequire(import.meta.url)
const { FeedbackFlow } = require('../out/server/feedbackFlow.js')
const { FeedbackManager } = require('../out/server/feedbackManager.js')
const { connectToExtension, requestFeedback } = require('../mcp-server/dist/extensionClient.js')
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')
const { PipelineHop } = require('../out/pipelineContracts.js')

describe('pipeline logging — MCP layer', () => {
  it('connectToExtension opens successfully on live port', async () => {
    const wss = new WebSocketServer({ port: 0 })
    const port = await new Promise((resolve) => {
      wss.on('listening', () => resolve(wss.address().port))
    })

    const ws = await connectToExtension(port)
    assert.equal(ws.readyState, 1)
    ws.close()
    await new Promise((r) => wss.close(r))
  })

  it('requestFeedback logs sent, armed keepalive, and feedback_error', async () => {
    const logs = []
    const wss = new WebSocketServer({ port: 0 })
    const port = await new Promise((resolve) => {
      wss.on('listening', () => resolve(wss.address().port))
    })

    wss.on('connection', (ws) => {
      ws.on('message', () => {
        ws.send(JSON.stringify({ type: 'feedback_error', error: 'test error' }))
      })
    })

    const ws = await new Promise((resolve, reject) => {
      const client = new (require('ws'))(`ws://127.0.0.1:${port}`)
      client.once('open', () => resolve(client))
      client.once('error', reject)
    })

    await assert.rejects(
      () => requestFeedback(ws, 'summary', '/repo', 'trace-1', {
        log: (m) => logs.push(m),
        heartbeatMs: 1_000_000,
        stdioKeepaliveMs: 1_000_000,
        cursorKeepaliveMs: 1_000_000,
      }),
      /test error/,
    )

    assert.ok(logs.some((l) => l.includes('feedback_request_sent')))
    assert.ok(logs.some((l) => l.includes('armed cursor_keepalive_ms=')))
    assert.ok(logs.some((l) => l.includes('[requestFeedback] feedback_error')))

    await new Promise((r) => wss.close(r))
  })

  it('requestFeedback logs session_bound without resolving early', async () => {
    const logs = []
    const wss = new WebSocketServer({ port: 0 })
    const port = await new Promise((resolve) => {
      wss.on('listening', () => resolve(wss.address().port))
    })

    wss.on('connection', (serverWs) => {
      serverWs.once('message', () => {
        serverWs.send(JSON.stringify({
          type: 'session_bound',
          session_id: 'fb-test-1',
          trace_id: 'trace-1',
        }))
        serverWs.send(JSON.stringify({
          type: 'feedback_result',
          status: 'submitted',
          feedback: 'ok',
          session_id: 'fb-test-1',
        }))
      })
    })

    const ws = await new Promise((resolve, reject) => {
      const client = new (require('ws'))(`ws://127.0.0.1:${port}`)
      client.once('open', () => resolve(client))
      client.once('error', reject)
    })

    const result = await requestFeedback(ws, 'summary', '/repo', 'trace-1', {
      log: (m) => logs.push(m),
      heartbeatMs: 1_000_000,
      stdioKeepaliveMs: 1_000_000,
      cursorKeepaliveMs: 1_000_000,
    })

    assert.equal(result.session_id, 'fb-test-1')
    assert.ok(logs.some((l) => l.includes('session_bound session=fb-test-1')))
    assert.ok(logs.some((l) => l.includes('resolved status=submitted session=fb-test-1')))

    ws.close()
    await new Promise((r) => wss.close(r))
  }, { timeout: 5000 })
})

describe('pipeline logging — Hub layer', () => {
  it('logs feedbackDeliver when MCP transport is open', async () => {
    const feedback = new FeedbackManager()
    const logs = []
    const fakeWs = { readyState: 1 }
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
      sendSessionBound: (_ws, payload) => {
        logs.push(`pipeline: hub→mcp:session_bound session=${payload.session_id}`)
      },
      log: (m) => logs.push(m),
    })

    flow.handleFeedbackRequest(fakeWs, {
      summary: 'Q',
      project_directory: '/proj',
      trace_id: 'trace-abc',
    })
    assert.ok(logs.some((l) => l.includes('pipeline: hub→mcp:session_bound')))
    const sessionId = feedback.pendingSessions()[0].id
    flow.handleFeedbackResponse({ session_id: sessionId, feedback: 'A', images: [] })
    await new Promise((r) => setTimeout(r, 20))

    assert.ok(logs.some((l) => l.includes(`pipeline: ${PipelineHop.MCP_REQUEST}`)))
    assert.ok(logs.some((l) => l.includes('feedbackDeliver:') && l.includes('detached=false')))
  })
})

describe('pipeline logging — keepalive handler', () => {
  it('toolHandlers logs keepalive auto-resolve', async () => {
    const logs = []
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {}, on() {}, send() {}, off() {} }),
      requestFeedback: async () => ({ status: 'keepalive', feedback: 'hello' }),
      browserFallback: async () => 'browser',
      log: (m) => logs.push(m),
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'wait' })
    assert.match(result.content[0].text, /\[keepalive\]/)
    assert.ok(logs.some((l) => l.includes('request_waste_guard')))
  })
})
