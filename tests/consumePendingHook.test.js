import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  isInteractiveFeedbackTool,
  buildFollowupMessage,
  shouldSkipRulesRefresh,
} = require('../scripts/hooks/feedback-guard.js')

describe('feedback-guard', () => {
  it('detects interactive_feedback tool names', () => {
    assert.equal(isInteractiveFeedbackTool('MCP:interactive_feedback'), true)
    assert.equal(isInteractiveFeedbackTool('interactive_feedback'), true)
    assert.equal(isInteractiveFeedbackTool('Write'), false)
  })

  it('buildFollowupMessage uses zero-cost followup_message field', () => {
    const out = buildFollowupMessage('checkpoint')
    assert.equal(out.followup_message, 'checkpoint')
    assert.equal(out.permission, undefined)
  })

  it('skips rules refresh when hub reports live feedback wait', () => {
    assert.equal(shouldSkipRulesRefresh({ active: true, detached: false }), true)
    assert.equal(shouldSkipRulesRefresh({ active: true, detached: true }), false)
    assert.equal(shouldSkipRulesRefresh(null), false)
    assert.equal(shouldSkipRulesRefresh({ active: false }), false)
  })
})
