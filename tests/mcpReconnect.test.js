import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')

describe('MCP feedback reconnect', () => {
  it('keeps waiting when extension discovery is temporarily empty after a closed connection', async () => {
    const logs = []
    const server = { port: 48200, pid: 123, projectPath: '/repo', version: '1' }
    const discoveries = [server, null, server]
    let connectCount = 0
    let requestCount = 0

    const handler = createToolCallHandler({
      findExtensionServer: async () => discoveries.shift() ?? null,
      connectToExtension: async () => {
        connectCount++
        return { close() {} }
      },
      requestFeedback: async () => {
        requestCount++
        if (requestCount === 1) throw new Error('Connection closed')
        return { feedback: 'ok' }
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
    assert.match(result.content[0].text, /^ok/)
    assert.equal(connectCount, 2)
    assert.ok(logs.some((line) => line.includes('rediscover 1/2 found no extension')))
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
