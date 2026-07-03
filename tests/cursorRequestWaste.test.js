import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const require = createRequire(import.meta.url)
const { createToolCallHandler } = require('../mcp-server/dist/toolHandlers.js')
const { FeedbackFlow } = require('../out/server/feedbackFlow.js')
const { FeedbackManager } = require('../out/server/feedbackManager.js')
const { planHooksConfigUpdate, applyHooksConfigPlan, SOURCE_TAG } = require('../out/deploy/hooks.js')

describe('toolHandlers — non-normal status handling', () => {
  it('returns informational text for timeout status (not user feedback)', async () => {
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {} }),
      requestFeedback: async () => ({ status: 'timeout', feedback: '' }),
      browserFallback: async () => 'browser',
      log: () => {},
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'test timeout' })
    assert.equal(result.isError, undefined)
    assert.match(result.content[0].text, /timeout/)
    assert.match(result.content[0].text, /did not complete/)
  })

  it('returns normal feedback for submitted status', async () => {
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {} }),
      requestFeedback: async () => ({ status: 'submitted', feedback: 'User reply' }),
      browserFallback: async () => 'browser',
      log: () => {},
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'test ok' })
    assert.match(result.content[0].text, /User reply/)
  })

  it('returns normal feedback when status is ok with feedback', async () => {
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {} }),
      requestFeedback: async () => ({ status: 'ok', feedback: 'All good' }),
      browserFallback: async () => 'browser',
      log: () => {},
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'test' })
    assert.match(result.content[0].text, /All good/)
  })
})

describe('feedbackFlow — already_pending via sendResult', () => {
  it('sends already_pending result (not error) on duplicate same-ws request', () => {
    const feedback = new FeedbackManager()
    const results = []
    const errors = []
    const flow = new FeedbackFlow({
      feedback,
      getHubWorkspaces: () => ['/proj'],
      appendReminder: (t) => t,
      addMessage: () => {},
      broadcastSessionUpdated: () => {},
      broadcastFeedbackSubmitted: () => {},
      clearPending: () => {},
      queueAsPending: () => {},
      sendResult: (_ws, result) => { results.push(result) },
      sendError: (_ws, err) => { errors.push(err.message) },
      log: () => {},
      getHubMeta: () => ({ port: 48201, pid: 1 }),
    })

    const ws = { readyState: 1 }
    flow.handleFeedbackRequest(ws, { summary: 'A', trace_id: 't1' })
    flow.handleFeedbackRequest(ws, { summary: 'B', trace_id: 't1' })

    assert.equal(results.length, 1)
    assert.equal(results[0].status, 'already_pending')
    assert.equal(results[0].feedback, '')
    assert.equal(errors.length, 0)
  })
})

describe('hook-utils — workspaceKey', () => {
  it('workspaceKey returns path without trailing slash', () => {
    const hookUtils = require('../scripts/hooks/hook-utils.js')
    assert.equal(hookUtils.workspaceKey(['/Users/a/proj/']), '/Users/a/proj')
    assert.equal(hookUtils.workspaceKey(['/Users/a/proj']), '/Users/a/proj')
  })

  it('workspaceKey returns _global for empty or missing input', () => {
    const hookUtils = require('../scripts/hooks/hook-utils.js')
    assert.equal(hookUtils.workspaceKey([]), '_global')
    assert.equal(hookUtils.workspaceKey(null), '_global')
    assert.equal(hookUtils.workspaceKey(undefined), '_global')
  })

  it('workspaceKey uses first root when multiple provided', () => {
    const hookUtils = require('../scripts/hooks/hook-utils.js')
    assert.equal(hookUtils.workspaceKey(['/a', '/b']), '/a')
  })

  it('DEFAULT_ENFORCEMENT has high thresholds', () => {
    const hookUtils = require('../scripts/hooks/hook-utils.js')
    assert.ok(hookUtils.DEFAULT_ENFORCEMENT.maxToolCalls >= 50)
    assert.ok(hookUtils.DEFAULT_ENFORCEMENT.maxMinutes >= 15)
  })
})

describe('deploy/hooks — stop hook registration', () => {
  it('planHooksConfigUpdate registers both preToolUse and stop', () => {
    const input = { version: 1, hooks: {} }
    const plan = planHooksConfigUpdate('/node', '/hook/consume-pending.js', input)
    assert.equal(plan.changed, true)
    const next = applyHooksConfigPlan(input, plan)
    assert.ok(next.hooks.preToolUse)
    assert.ok(next.hooks.stop)
    assert.match(next.hooks.preToolUse[0].command, /consume-pending\.js/)
    assert.match(next.hooks.stop[0].command, /consume-pending\.js/)
  })

  it('strips sessionStart from legacy hooks', () => {
    const input = {
      version: 1,
      hooks: {
        sessionStart: [{ command: 'old', _source: SOURCE_TAG }],
        preCompact: [{ command: 'old', _source: SOURCE_TAG }],
      },
    }
    const plan = planHooksConfigUpdate('/node', '/hook/consume-pending.js', input)
    const next = applyHooksConfigPlan(input, plan)
    assert.equal(next.hooks.sessionStart, undefined)
    assert.equal(next.hooks.preCompact, undefined)
    assert.ok(next.hooks.stop)
  })
})
