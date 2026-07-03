import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { formatSessionLifecycleLine } = require('../out/sessionLifecycleLog.js')

describe('sessionLifecycleLog', () => {
  it('formats lifecycle lines for grep sessionLifecycle:', () => {
    const line = formatSessionLifecycleLine({
      event: 'create',
      sessionId: 'fb-abc',
      project: '/Users/hunter/ws',
      traceId: 'trace-1',
      mcpConnId: 3,
      pendingCount: 2,
      reason: 'parallel_live_mcp:fb-old',
    })
    assert.match(line, /^sessionLifecycle: event=create/)
    assert.match(line, /session=fb-abc/)
    assert.match(line, /trace=trace-1/)
    assert.match(line, /reason=parallel_live_mcp:fb-old/)
  })
})
