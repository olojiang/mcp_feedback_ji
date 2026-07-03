import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { formatLogEvent } = require('../out/structuredLog.js')

describe('structuredLog', () => {
  it('formats event= key=value pairs', () => {
    const line = formatLogEvent('Hub', 'stale_sweep', {
      action: 'skip',
      client_type: 'mcp-server',
      idle_ms: 120000,
      empty: '',
    })
    assert.match(line, /\[Hub\] event=stale_sweep/)
    assert.match(line, /action=skip/)
    assert.match(line, /client_type=mcp-server/)
    assert.doesNotMatch(line, /empty=/)
  })
})
