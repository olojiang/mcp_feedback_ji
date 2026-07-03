import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveTraceId, traceLogSuffix } = require('../out/traceContext.js')
const { sessionUpdatedLogLine, evaluateBroadcastDelivery } = require('../out/feedbackDelivery.js')

describe('traceContext', () => {
  it('prefers request trace_id then agent context then env', () => {
    assert.equal(resolveTraceId('req-t', 'ctx-t', 'env-t'), 'req-t')
    assert.equal(resolveTraceId(undefined, 'ctx-t', 'env-t'), 'ctx-t')
    assert.equal(resolveTraceId(undefined, undefined, 'env-t'), 'env-t')
    assert.equal(resolveTraceId('', '', ''), undefined)
  })

  it('formats trace suffix for logs', () => {
    assert.equal(traceLogSuffix('trace-abc'), ' trace=trace-abc')
    assert.equal(traceLogSuffix(undefined), '')
  })

  it('sessionUpdated log includes trace when provided', () => {
    const line = sessionUpdatedLogLine(
      'fb-1',
      evaluateBroadcastDelivery(1),
      '/proj',
      'trace-xyz',
    )
    assert.match(line, /trace=trace-xyz/)
    assert.match(line, /project=\/proj/)
  })
})
