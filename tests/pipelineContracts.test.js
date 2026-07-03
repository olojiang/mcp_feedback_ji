import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  PipelineHop,
  canSendFeedbackRequest,
  canSendFeedbackResponse,
  pipelineRejectReason,
  pipelineTraceLine,
} = require('../out/pipelineContracts.js')

describe('pipelineContracts', () => {
  it('allows feedback_request only from mcp-server or unknown', () => {
    assert.equal(canSendFeedbackRequest('mcp-server'), true)
    assert.equal(canSendFeedbackRequest('unknown'), true)
    assert.equal(canSendFeedbackRequest('webview'), false)
  })

  it('allows feedback_response only from webview', () => {
    assert.equal(canSendFeedbackResponse('webview'), true)
    assert.equal(canSendFeedbackResponse('mcp-server'), false)
    assert.equal(canSendFeedbackResponse('unknown'), false)
  })

  it('returns reject reason when webview sends feedback_request', () => {
    const reason = pipelineRejectReason(PipelineHop.MCP_REQUEST, 'webview')
    assert.match(reason, /pipeline_reject:mcp→hub:feedback_request:client=webview/)
  })

  it('returns reject reason when mcp sends feedback_response', () => {
    const reason = pipelineRejectReason(PipelineHop.UI_RESPONSE, 'mcp-server')
    assert.match(reason, /pipeline_reject:ui→hub:feedback_response:client=mcp-server/)
  })

  it('formats trace lines with hop id', () => {
    assert.equal(
      pipelineTraceLine(PipelineHop.HUB_ENQUEUE, 'session=fb-abc'),
      'pipeline: hub:enqueue session=fb-abc',
    )
  })
})
