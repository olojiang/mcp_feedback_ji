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
const {
  planHooksConfigUpdate,
  applyHooksConfigPlan,
  SOURCE_TAG,
  HOOK_FILES,
} = require('../out/deploy/hooks.js')

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

  it('releases stale duplicate waits so Cursor does not subscribe a new request forever', () => {
    const feedback = new FeedbackManager()
    const results = []
    const logs = []
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
      sendError: () => {},
      log: (msg) => logs.push(msg),
      getHubMeta: () => ({ port: 48201, pid: 1 }),
    })

    const realNow = Date.now
    const ws = { readyState: 1 }
    try {
      Date.now = () => 1_000_000
      flow.handleFeedbackRequest(ws, { summary: 'A', trace_id: 't-stale' })
      Date.now = () => 1_000_000 + 36 * 60 * 1000
      flow.handleFeedbackRequest(ws, { summary: 'B', trace_id: 't-stale' })
    } finally {
      Date.now = realNow
    }

    assert.equal(results.length, 1)
    assert.equal(results[0].status, 'released_duplicate')
    assert.equal(results[0].feedback, '')
    assert.equal(feedback.pendingCount(), 1, 'original panel wait remains pending')
    assert.ok(logs.some((l) => l.includes('stale_duplicate_release')))
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

describe('deploy/hooks — stop hook retired to prevent loop', () => {
  it('deploys every local dependency required by an active hook', () => {
    const hooksDir = path.join(import.meta.dirname, '..', 'scripts', 'hooks')
    const pending = [...HOOK_FILES]
    const checked = new Set()

    while (pending.length > 0) {
      const file = pending.pop()
      if (checked.has(file)) continue
      checked.add(file)

      const source = fs.readFileSync(path.join(hooksDir, file), 'utf8')
      const dependencies = source.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)
      for (const match of dependencies) {
        const dependency = match[1].endsWith('.js') ? match[1] : `${match[1]}.js`
        assert.ok(
          HOOK_FILES.includes(dependency),
          `${file} requires ${dependency}, but it is missing from HOOK_FILES`,
        )
        pending.push(dependency)
      }
    }
  })

  it('planHooksConfigUpdate registers preToolUse only, not stop', () => {
    const input = { version: 1, hooks: {} }
    const plan = planHooksConfigUpdate('/node', '/hook/consume-pending.js', input)
    assert.equal(plan.changed, true)
    const next = applyHooksConfigPlan(input, plan)
    assert.ok(next.hooks.preToolUse)
    assert.equal(next.hooks.stop, undefined, 'stop must be retired')
    assert.match(next.hooks.preToolUse[0].command, /consume-pending\.js/)
  })

  it('strips legacy hooks and removes existing stop hook', () => {
    const input = {
      version: 1,
      hooks: {
        sessionStart: [{ command: 'old', _source: SOURCE_TAG }],
        preCompact: [{ command: 'old', _source: SOURCE_TAG }],
        stop: [{ command: 'old-stop', _source: SOURCE_TAG }],
      },
    }
    const plan = planHooksConfigUpdate('/node', '/hook/consume-pending.js', input)
    const next = applyHooksConfigPlan(input, plan)
    assert.equal(next.hooks.sessionStart, undefined)
    assert.equal(next.hooks.preCompact, undefined)
    assert.equal(next.hooks.stop, undefined, 'stop must be retired')
  })
})

describe('toolHandlers — connection closed retry', () => {
  it('retries once when MCP connection closed during wait', async () => {
    let attempts = 0
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => {
        attempts++
        return { close() {} }
      },
      requestFeedback: async () => {
        if (attempts === 1) {
          throw new Error('Extension connection closed during feedback wait (reason=extension_ws_close) — reload')
        }
        return { status: 'submitted', feedback: 'recovered' }
      },
      browserFallback: async () => 'browser',
      log: () => {},
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'test' })
    assert.equal(attempts, 2)
    assert.match(result.content[0].text, /recovered/)
  })
})

describe('toolHandlers — hard timeout no retry', () => {
  it('does not retry when extension closes with cursor_hard_timeout_suspected', async () => {
    const logs = []
    let attempts = 0
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => {
        attempts++
        return { close() {} }
      },
      requestFeedback: async () => {
        throw new Error(
          'Extension connection closed during feedback wait (reason=cursor_hard_timeout_suspected) — reload',
        )
      },
      browserFallback: async () => 'browser',
      log: (m) => logs.push(m),
      readAgentContext: () => null,
    })

    const result = await handler('interactive_feedback', { summary: 'test' })
    assert.equal(attempts, 1)
    assert.match(result.content[0].text, /cursor_hard_timeout/)
    assert.ok(logs.some((l) => l.includes('cursor_hard_timeout_suspected') && l.includes('not retrying')))
  })
})

describe('toolHandlers — noOp billing elapsed', () => {
  it('logs non-zero elapsed_ms for released_duplicate no-op', async () => {
    const logs = []
    const handler = createToolCallHandler({
      findExtensionServer: async () => ({
        port: 48201, pid: 1, projectPath: '/repo', version: '1',
      }),
      connectToExtension: async () => ({ close() {} }),
      requestFeedback: async () => new Promise((resolve) => {
        setTimeout(() => resolve({ status: 'released_duplicate', feedback: '', session_id: 'fb-x' }), 50)
      }),
      browserFallback: async () => 'browser',
      log: (m) => logs.push(m),
      readAgentContext: () => null,
    })

    await handler('interactive_feedback', { summary: 'test' })
    const billing = logs.find((l) => l.includes('event=request_billing_risk') && l.includes('released_duplicate'))
    assert.ok(billing)
    assert.match(billing, /elapsed_ms=[1-9]\d*/)
  })
})
