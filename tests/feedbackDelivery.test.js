import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  sessionUpdatedLogLine,
  sessionReplayLogLine,
  sessionDisplayedLogLine,
  feedbackResponseLogLine,
  evaluateBroadcastDelivery,
  detectUiSyncMismatch,
} = require('../out/feedbackDelivery.js')


describe('feedbackDelivery', () => {
  it('detects undelivered session_updated when no webview is connected', () => {
    const d = evaluateBroadcastDelivery(0)
    assert.equal(d.delivered, false)
    assert.match(sessionUpdatedLogLine('fb-abc', d), /UNDELIVERED/)
  })

  it('logs delivery when webview clients exist', () => {
    const d = evaluateBroadcastDelivery(1)
    assert.equal(d.delivered, true)
    assert.match(sessionUpdatedLogLine('fb-abc', d), /delivered session=fb-abc webviews=1/)
  })

  it('detects UI sync mismatch when server pending exceeds local waiting tabs', () => {
    const msg = detectUiSyncMismatch({
      serverPendingCount: 2,
      localWaitingCount: 0,
      bridgeReady: true,
    })
    assert.match(msg, /UI missing 2 waiting tab/)
  })

  it('ignores mismatch when bridge is down', () => {
    assert.equal(
      detectUiSyncMismatch({ serverPendingCount: 1, localWaitingCount: 0, bridgeReady: false }),
      null,
    )
  })
})

describe('feedbackDelivery project_directory in logs', () => {
  it('includes project in sessionUpdated delivered line', () => {
    const line = sessionUpdatedLogLine(
      'fb-abc',
      evaluateBroadcastDelivery(1),
      '/Users/hunter/Workspace/spatial-smart-cc',
    )
    assert.match(line, /project=\/Users\/hunter\/Workspace\/spatial-smart-cc/)
    assert.match(line, /delivered session=fb-abc/)
  })

  it('includes project in UNDELIVERED line', () => {
    const line = sessionUpdatedLogLine(
      'fb-x',
      evaluateBroadcastDelivery(0),
      '/repo/a',
    )
    assert.match(line, /UNDELIVERED.*project=\/repo\/a/)
  })

  it('includes project in replay and displayed ack lines', () => {
    assert.match(
      sessionReplayLogLine('fb-1', 'webview', '/repo/a'),
      /sessionReplay: session=fb-1 project=\/repo\/a/,
    )
    assert.match(
      sessionDisplayedLogLine('fb-1', '/repo/a'),
      /sessionDisplayed: ack session=fb-1 project=\/repo\/a/,
    )
  })

  it('redacts feedback response body by default', () => {
    const line = feedbackResponseLogLine(
      'fb-1',
      '/repo/a',
      'secret token should not be logged',
      'trace-1',
      2,
    )
    assert.match(line, /feedbackResponse: session=fb-1/)
    assert.match(line, /feedback_len=33/)
    assert.match(line, /image_count=2/)
    assert.match(line, /preview_redacted=true/)
    assert.doesNotMatch(line, /secret token/)
  })

  it('allows explicit feedback preview logging for local debugging', () => {
    process.env.MCP_FEEDBACK_LOG_FEEDBACK_PREVIEW = '1'
    try {
      const line = feedbackResponseLogLine('fb-1', '/repo/a', 'hello\nworld')
      assert.match(line, /preview_redacted=false/)
      assert.match(line, /feedback_preview=hello world/)
    } finally {
      delete process.env.MCP_FEEDBACK_LOG_FEEDBACK_PREVIEW
    }
  })
})
