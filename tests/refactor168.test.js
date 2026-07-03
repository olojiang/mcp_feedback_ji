import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('deploy mcpConfig', () => {
  it('planMcpConfigUpdate detects unchanged entry', () => {
    const path = require('node:path')
    const { planMcpConfigUpdate } = require('../out/deploy/mcpConfig.js')
    const ext = '/ext'
    const args = [path.join(ext, 'mcp-server', 'dist', 'index.js')]
    const plan = planMcpConfigUpdate(ext, '2.5.1-ji.68', '/usr/bin/node', {
      command: '/usr/bin/node',
      args,
      env: { MCP_FEEDBACK_VERSION: '2.5.1-ji.68' },
    })
    assert.equal(plan.changed, false)
  })

  it('applyMcpConfigPlan removes legacy server key', () => {
    const { planMcpConfigUpdate, applyMcpConfigPlan } = require('../out/deploy/mcpConfig.js')
    const plan = planMcpConfigUpdate('/ext', '2.5.1-ji.68', 'node')
    const next = applyMcpConfigPlan({ mcpServers: { 'mcp-feedback-v2': {} } }, plan)
    assert.ok(next.mcpServers['mcp-feedback-enhanced'])
    assert.equal(next.mcpServers['mcp-feedback-v2'], undefined)
  })
})

describe('resolveNodeBin lazy cache', () => {
  afterEach(() => {
    const { resetNodeBinCacheForTests } = require('../out/deploy/nodeBin.js')
    resetNodeBinCacheForTests()
  })

  it('caches node path after first resolve', () => {
    const { resolveNodeBin } = require('../out/deploy/nodeBin.js')
    let calls = 0
    const exec = () => {
      calls++
      return '/opt/node\n'
    }
    assert.equal(resolveNodeBin(exec), '/opt/node')
    assert.equal(resolveNodeBin(exec), '/opt/node')
    assert.equal(calls, 1)
  })
})

describe('structuredFileLog batching', () => {
  it('flushes queued lines on timer', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const { BatchedFileLogger } = require('../out/structuredFileLog.js')
    const lines = []
    const logger = new BatchedFileLogger('/tmp/test.log', {
      append: (_p, line) => lines.push(line),
    }, 50)
    logger.append('event=one')
    logger.append('event=two')
    mock.timers.tick(50)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /event=one/)
    assert.match(lines[0], /event=two/)
    mock.timers.reset()
  })
})

describe('stateSyncPayload incremental', () => {
  it('omits timeline messages after first sync', () => {
    const { buildStateSyncPayload } = require('../out/stateSyncPayload.js')
    const full = buildStateSyncPayload({
      messages: [{ role: 'ai', content: 'hi', timestamp: 't' }],
      syncGeneration: 0,
      pendingComments: [],
      pendingImages: [],
      feedbackQueueSize: 0,
      pendingSessions: [],
      hub: { port: 1 },
    })
    assert.equal(full.messages.length, 1)
    assert.equal(full.incremental, false)

    const inc = buildStateSyncPayload({
      messages: [{ role: 'ai', content: 'hi', timestamp: 't' }],
      syncGeneration: 1,
      pendingComments: [],
      pendingImages: [],
      feedbackQueueSize: 0,
      pendingSessions: [],
      hub: { port: 1 },
      lastMessageCount: 1,
    })
    assert.equal(inc.messages_unchanged, true)
    assert.equal(inc.incremental, true)
  })
})

describe('webviewMessageRouter', () => {
  it('dispatches by message type', () => {
    const { createWebviewMessageRouter } = require('../out/webviewMessageRouter.js')
    const seen = []
    const route = createWebviewMessageRouter({
      ping: () => seen.push('ping'),
    })
    route({ type: 'ping' }, {}, {})
    assert.deepEqual(seen, ['ping'])
  })
})
