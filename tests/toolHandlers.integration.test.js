import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')

describe('toolHandlers integration', () => {
  it('passes trace_id from agent context into requestFeedback wire call', async () => {
    let wireTrace = null
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {} }),
      requestFeedback: async (_ws, _summary, _project, traceId) => {
        wireTrace = traceId
        return { feedback: 'traced ok' }
      },
      browserFallback: async () => 'browser',
      log: () => {},
      readAgentContext: () => ({ traceId: 'agent-ctx-99', workspaceRoots: ['/repo'], updatedAt: Date.now() }),
    })

    const result = await handler('interactive_feedback', {
      summary: 'trace test',
      project_directory: '/repo',
    })

    assert.equal(wireTrace, 'agent-ctx-99')
    assert.match(result.content[0].text, /traced ok/)
  })

  it('uses browser fallback when extension missing and env flag set', async () => {
    const prev = process.env.MCP_FEEDBACK_BROWSER_FALLBACK
    process.env.MCP_FEEDBACK_BROWSER_FALLBACK = '1'
    try {
      const handler = createToolCallHandler({
        findExtensionServer: async () => null,
        connectToExtension: async () => { throw new Error('no connect') },
        requestFeedback: async () => ({ feedback: 'nope' }),
        browserFallback: async (summary) => `browser:${summary}`,
        log: () => {},
        readAgentContext: () => null,
      })

      const result = await handler('interactive_feedback', {
        summary: 'fallback please',
      })

      assert.equal(result.isError, undefined)
      assert.match(result.content[0].text, /browser:fallback please/)
    } finally {
      if (prev === undefined) delete process.env.MCP_FEEDBACK_BROWSER_FALLBACK
      else process.env.MCP_FEEDBACK_BROWSER_FALLBACK = prev
    }
  })

  it('retries extension connection then succeeds', async () => {
    let attempts = 0
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48202, pid: 2, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => {
        attempts++
        if (attempts < 2) throw new Error('Connection closed')
        return { close() {} }
      },
      requestFeedback: async () => ({ feedback: 'retry ok' }),
      browserFallback: async () => 'browser',
      log: () => {},
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'retry' })
    assert.match(result.content[0].text, /retry ok/)
    assert.equal(attempts, 2)
  })
})
