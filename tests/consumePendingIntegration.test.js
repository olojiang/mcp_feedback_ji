import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const HOOK_UTILS_PATH = path.join(import.meta.dirname, '..', 'scripts', 'hooks', 'hook-utils.js')
const CONSUME_PENDING_PATH = path.join(import.meta.dirname, '..', 'scripts', 'hooks', 'consume-pending.js')

function projectHash(dir) {
  const crypto = require('node:crypto')
  const normalized = path.normalize(dir).replace(/\/+$/, '')
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

function loadHookModules(configDir) {
  process.env.MCP_FEEDBACK_CONFIG_DIR = configDir
  delete require.cache[HOOK_UTILS_PATH]
  delete require.cache[CONSUME_PENDING_PATH]
  const hookUtils = require(HOOK_UTILS_PATH)
  const { runHook } = require(CONSUME_PENDING_PATH)
  return { hookUtils, runHook }
}

describe('consume-pending integration', () => {
  let tmpDir
  let workspace
  let activeTrace
  let serversDir
  let hookUtils
  let runHook
  let origHttpGet

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hook-int-'))
    workspace = path.join(tmpDir, 'proj')
    serversDir = path.join(tmpDir, 'servers')
    fs.mkdirSync(workspace, { recursive: true })
    fs.mkdirSync(serversDir, { recursive: true })
    activeTrace = '11111111-2222-4333-8444-555555555555'

    const loaded = loadHookModules(tmpDir)
    hookUtils = loaded.hookUtils
    runHook = loaded.runHook
    origHttpGet = hookUtils.httpGet

    const hash = projectHash(workspace)
    fs.writeFileSync(path.join(serversDir, `${hash}.json`), JSON.stringify({
      port: 48201,
      pid: process.pid,
      projectPath: workspace,
      version: '2.5.1-ji.135',
    }))

    hookUtils.httpGet = async (port, urlPath) => {
      if (urlPath.startsWith('/feedback-active')) {
        const trace = new URL(urlPath, 'http://127.0.0.1').searchParams.get('trace_id') || ''
        if (trace === activeTrace) {
          return { status: 200, data: { active: true, sessionId: 'fb-hook-test', detached: false } }
        }
      }
      return origHttpGet(port, urlPath)
    }
  })

  afterEach(() => {
    if (hookUtils && origHttpGet) hookUtils.httpGet = origHttpGet
    delete process.env.MCP_FEEDBACK_CONFIG_DIR
    delete require.cache[HOOK_UTILS_PATH]
    delete require.cache[CONSUME_PENDING_PATH]
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('denies duplicate interactive_feedback when hub reports live wait', async () => {
    const out = await runHook({
      hook_event_name: 'preToolUse',
      tool_name: 'MCP:interactive_feedback',
      trace_id: activeTrace,
      conversation_id: activeTrace.slice(0, 8),
      workspace_roots: [workspace],
    })

    assert.equal(out.permission, 'deny')
    assert.match(out.user_message, /already waiting/)
    assert.match(out.agent_message, /Do not call interactive_feedback again/)
  })

  it('allows interactive_feedback when hub has no live wait', async () => {
    const out = await runHook({
      hook_event_name: 'preToolUse',
      tool_name: 'MCP:interactive_feedback',
      trace_id: '99999999-aaaa-bbbb-cccc-dddddddddddd',
      conversation_id: '99999999',
      workspace_roots: [workspace],
    })

    assert.equal(out.permission, undefined)
  })

  it('skips rules refresh while live feedback wait is active', async () => {
    const stateFile = path.join(tmpDir, 'feedback-state.json')
    fs.writeFileSync(stateFile, JSON.stringify({
      [workspace]: {
        toolsSinceFeedback: 50,
        lastFeedbackAt: Date.now() - 60000,
        lastTool: 'write',
      },
    }))

    const out = await runHook({
      hook_event_name: 'preToolUse',
      tool_name: 'Write',
      trace_id: activeTrace,
      conversation_id: activeTrace.slice(0, 8),
      workspace_roots: [workspace],
    })

    assert.equal(out.permission, undefined)
    assert.equal(out.user_message, undefined)
    assert.equal(out.followup_message, undefined)
  })
})
