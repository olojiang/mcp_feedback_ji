import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  PONG_TEXT,
  buildToolDefinitions,
  createToolCallHandler,
} = require('../mcp-server/dist/toolHandlers.js')

function makeHandler(logs = []) {
  return createToolCallHandler({
    findExtensionServer: async () => null,
    connectToExtension: async () => {
      throw new Error('should not connect')
    },
    requestFeedback: async () => {
      throw new Error('should not request feedback')
    },
    browserFallback: async () => 'browser',
    log: (msg) => logs.push(msg),
  })
}

describe('MCP ping tool', () => {
  it('registers ping in tool definitions', () => {
    const tools = buildToolDefinitions()
    const ping = tools.find((t) => t.name === 'ping')
    assert.ok(ping)
    assert.match(ping.description, /pong/i)
  })

  it('returns fixed pong without touching extension', async () => {
    const logs = []
    const handler = makeHandler(logs)
    const result = await handler('ping', {})
    assert.equal(PONG_TEXT, 'pong')
    assert.equal(result.content[0].text, 'pong')
    assert.equal(result.isError, undefined)
    assert.ok(logs.some((line) => line.includes('ping -> pong')))
  })
})
