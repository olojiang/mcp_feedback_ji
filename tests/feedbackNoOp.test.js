import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { feedbackNoOpToolText, requestWasteGuardLogLine } = require('../mcp-server/dist/feedbackNoOp.js')
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')

describe('feedbackNoOp', () => {
  it('keepalive text forbids re-calling interactive_feedback', () => {
    const text = feedbackNoOpToolText('keepalive')
    assert.match(text, /\[keepalive\]/)
    assert.match(text, /Do NOT call interactive_feedback again/)
    assert.match(text, /End your turn immediately/)
  })

  it('released_duplicate text forbids agent action', () => {
    const text = feedbackNoOpToolText('released_duplicate')
    assert.match(text, /\[released_duplicate\]/)
    assert.match(text, /Do NOT call interactive_feedback again/)
  })

  it('request_waste_guard log line is grep-friendly', () => {
    assert.match(
      requestWasteGuardLogLine('superseded', 'trace-1'),
      /event=request_waste_guard reason=superseded trace=trace-1/,
    )
  })
})

describe('toolHandlers released_duplicate', () => {
  it('returns no-op response without retry instruction', async () => {
    const logs = []
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {}, on() {}, send() {}, off() {} }),
      requestFeedback: async () => ({ status: 'released_duplicate', feedback: '', session_id: 'fb-x' }),
      browserFallback: async () => 'browser',
      log: (m) => logs.push(m),
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'wait' })
    assert.match(result.content[0].text, /\[released_duplicate\]/)
    assert.ok(logs.some((l) => String(l).includes('request_waste_guard')))
  })
})
