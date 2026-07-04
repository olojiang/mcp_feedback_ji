import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createToolCallHandler,
  buildToolDefinitions,
  PONG_TEXT,
} = require('../mcp-server/dist/toolHandlers.js')

function makeDeps(overrides = {}) {
  const logs = []
  return {
    findExtensionServer: async () => null,
    connectToExtension: async () => { throw new Error('no connect') },
    requestFeedback: async () => ({ feedback: '' }),
    browserFallback: async () => 'browser-fb',
    log: (msg) => logs.push(msg),
    readAgentContext: () => null,
    rediscoveryAttempts: 1,
    retryDelayMs: 0,
    logs,
    ...overrides,
  }
}

describe('toolHandlers', () => {
  describe('buildToolDefinitions', () => {
    it('returns 3 tool definitions', () => {
      const defs = buildToolDefinitions()
      assert.equal(defs.length, 3)
      assert.deepEqual(
        defs.map((d) => d.name),
        ['interactive_feedback', 'get_system_info', 'ping']
      )
    })

    it('interactive_feedback requires summary', () => {
      const def = buildToolDefinitions().find((d) => d.name === 'interactive_feedback')
      assert.deepEqual(def.inputSchema.required, ['summary'])
    })
  })

  describe('get_system_info', () => {
    it('returns system info as JSON text', async () => {
      const deps = makeDeps()
      const handler = createToolCallHandler(deps)
      const result = await handler('get_system_info', {})
      assert.equal(result.content.length, 1)
      assert.equal(result.content[0].type, 'text')
      const info = JSON.parse(result.content[0].text)
      assert.equal(info.platform, process.platform)
      assert.equal(info.arch, process.arch)
      assert.ok(info.nodeVersion.startsWith('v'))
    })
  })

  describe('ping', () => {
    it('returns pong text', async () => {
      const deps = makeDeps()
      const handler = createToolCallHandler(deps)
      const result = await handler('ping', {})
      assert.equal(result.content[0].text, PONG_TEXT)
    })
  })

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const deps = makeDeps()
      const handler = createToolCallHandler(deps)
      const result = await handler('nonexistent_tool', {})
      assert.equal(result.isError, true)
      assert.match(result.content[0].text, /Unknown tool/)
    })
  })

  describe('interactive_feedback', () => {
    it('returns feedback when extension is available', async () => {
      const deps = makeDeps({
        findExtensionServer: async () => ({ port: 48200, pid: 100 }),
        connectToExtension: async () => ({ send() {}, on() {}, once() {}, off() {} }),
        requestFeedback: async () => ({ status: 'submitted', feedback: 'user says hello' }),
      })
      const handler = createToolCallHandler(deps)
      const result = await handler('interactive_feedback', { summary: 'test summary' })
      assert.equal(result.isError, undefined)
      assert.match(result.content[0].text, /user says hello/)
    })

    it('returns error when no extension found and browser fallback disabled', async () => {
      const origEnv = process.env.MCP_FEEDBACK_BROWSER_FALLBACK
      process.env.MCP_FEEDBACK_BROWSER_FALLBACK = '0'
      const deps = makeDeps()
      const handler = createToolCallHandler(deps)
      const result = await handler('interactive_feedback', { summary: 'test' })
      process.env.MCP_FEEDBACK_BROWSER_FALLBACK = origEnv
      assert.equal(result.isError, true)
      assert.match(result.content[0].text, /extension not connected/i)
    })

    it('includes images in response when provided', async () => {
      const deps = makeDeps({
        findExtensionServer: async () => ({ port: 48200, pid: 100 }),
        connectToExtension: async () => ({ send() {}, on() {}, once() {}, off() {} }),
        requestFeedback: async () => ({
          status: 'submitted',
          feedback: 'with image',
          images: ['base64data1', 'base64data2'],
        }),
      })
      const handler = createToolCallHandler(deps)
      const result = await handler('interactive_feedback', { summary: 'test' })
      assert.equal(result.content.length, 3)
      assert.equal(result.content[1].type, 'image')
      assert.equal(result.content[1].data, 'base64data1')
      assert.equal(result.content[2].data, 'base64data2')
    })

    it('retries on extension connection failure', async () => {
      let connectCalls = 0
      const deps = makeDeps({
        findExtensionServer: async () => ({ port: 48200, pid: 100 }),
        connectToExtension: async () => {
          connectCalls++
          if (connectCalls === 1) throw new Error('connection failed')
          return { send() {}, on() {}, once() {}, off() {} }
        },
        requestFeedback: async () => ({ status: 'submitted', feedback: 'retry ok' }),
        rediscoveryAttempts: 1,
        retryDelayMs: 0,
      })
      const handler = createToolCallHandler(deps)
      const result = await handler('interactive_feedback', { summary: 'test' })
      assert.match(result.content[0].text, /retry ok/)
    })

    it('returns non-submitted status as notice', async () => {
      const deps = makeDeps({
        findExtensionServer: async () => ({ port: 48200, pid: 100 }),
        connectToExtension: async () => ({ send() {}, on() {}, once() {}, off() {} }),
        requestFeedback: async () => ({ status: 'timeout', feedback: '' }),
      })
      const handler = createToolCallHandler(deps)
      const result = await handler('interactive_feedback', { summary: 'test' })
      assert.match(result.content[0].text, /timeout/)
    })
  })
})
