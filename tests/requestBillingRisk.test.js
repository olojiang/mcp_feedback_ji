import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  classifyWsCloseBillingRisk,
  requestBillingRiskLogLine,
  CURSOR_HARD_TIMEOUT_SUSPECT_MS,
} = require('../mcp-server/dist/requestBillingRisk.js')

describe('requestBillingRisk', () => {
  it('classifies long ws close as cursor hard timeout suspect', () => {
    const elapsed = CURSOR_HARD_TIMEOUT_SUSPECT_MS + 60_000
    assert.equal(classifyWsCloseBillingRisk(elapsed), 'cursor_hard_timeout_suspected')
    assert.equal(classifyWsCloseBillingRisk(5 * 60_000), 'extension_ws_close')
  })

  it('our_keepalive log includes elapsed and keepalive_ms for usage correlation', () => {
    const line = requestBillingRiskLogLine({
      reason: 'our_keepalive',
      elapsedMs: 30 * 60_000,
      traceId: 't1',
      projectDirectory: '/proj',
      keepaliveMs: 30 * 60_000,
      detail: 'tool_will_complete_end_turn_no_retry',
    })
    assert.match(line, /event=request_billing_risk/)
    assert.match(line, /reason=our_keepalive/)
    assert.match(line, /elapsed_min=30/)
    assert.match(line, /keepalive_ms=1800000/)
  })
})
