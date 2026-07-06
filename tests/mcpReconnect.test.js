import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')

describe('MCP feedback reconnect', () => {
  it('returns connection_closed without retry when feedback wait ends on closed connection', async () => {
    const logs = []
    const server = { port: 48200, pid: 123, projectPath: '/repo', version: '1' }
    let connectCount = 0
    let requestCount = 0

    const handler = createToolCallHandler({
      findExtensionServer: async () => server,
      connectToExtension: async () => {
        connectCount++
        return { close() {} }
      },
      requestFeedback: async () => {
        requestCount++
        throw new Error('Connection closed')
      },
      browserFallback: async () => {
        throw new Error('browser fallback should not run')
      },
      log: (msg) => logs.push(msg),
      rediscoveryAttempts: 2,
      retryDelayMs: 0,
    })

    const result = await handler('interactive_feedback', {
      summary: 'need feedback',
      project_directory: '/repo',
    })

    assert.equal(result.isError, undefined)
    assert.match(result.content[0].text, /\[connection_closed\]/)
    assert.equal(connectCount, 1)
    assert.equal(requestCount, 1)
    assert.ok(logs.some((line) => line.includes('not retrying')))
  })

  it('returns an extension unavailable error after rediscovery is exhausted', async () => {
    const logs = []
    const handler = createToolCallHandler({
      findExtensionServer: async () => null,
      connectToExtension: async () => {
        throw new Error('should not connect')
      },
      requestFeedback: async () => {
        throw new Error('should not request feedback')
      },
      browserFallback: async () => {
        throw new Error('browser fallback should not run')
      },
      log: (msg) => logs.push(msg),
      rediscoveryAttempts: 2,
      retryDelayMs: 0,
    })

    const result = await handler('interactive_feedback', {
      summary: 'need feedback',
      project_directory: '/repo',
    })

    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /extension not connected/i)
    assert.equal(logs.filter((line) => line.includes('rediscover')).length, 1)
  })
})
