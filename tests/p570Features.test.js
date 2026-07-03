import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('4 createTestClipboard', () => {
  it('returns a ClipboardPort with defaults', async () => {
    const { createTestClipboard } = require('../out/testClipboard.js')
    const clip = createTestClipboard()
    assert.equal(await clip.readText(), '')
    await clip.writeText('x')
  })

  it('accepts overrides', async () => {
    const { createTestClipboard } = require('../out/testClipboard.js')
    const clip = createTestClipboard({ readText: async () => 'hi' })
    assert.equal(await clip.readText(), 'hi')
  })
})

describe('3 hooks command drift', () => {
  it('detects node path drift even when hooks shape unchanged', () => {
    const { hooksCommandDrift, SOURCE_TAG } = require('../out/deploy/hooks.js')
    const drift = hooksCommandDrift({
      hooks: {
        preToolUse: [{ command: '/old/node /hook.js', _source: SOURCE_TAG }],
      },
    }, '/new/node', '/hook.js')
    assert.equal(drift, true)
  })

  it('planHooksConfigUpdate marks changed on drift', () => {
    const { planHooksConfigUpdate, SOURCE_TAG } = require('../out/deploy/hooks.js')
    const plan = planHooksConfigUpdate('/new/node', '/hook.js', {
      hooks: {
        preToolUse: [{ command: '/old/node /hook.js', _source: SOURCE_TAG }],
      },
    })
    assert.equal(plan.changed, true)
  })
})

describe('6 log trace filter', () => {
  it('filterLogLinesByTrace keeps matching lines', () => {
    const { filterLogLinesByTrace } = require('../out/logTail.js')
    const lines = [
      'event=a trace=abc-1',
      'event=b trace=xyz-2',
      'event=c trace=abc-1 done',
    ]
    const out = filterLogLinesByTrace(lines, 'abc-1')
    assert.equal(out.length, 2)
    assert.match(out[0], /abc-1/)
  })
})

describe('8 message_patch incremental', () => {
  it('emits append patch when timeline grows', () => {
    const { buildMessageSync } = require('../out/stateSyncPayload.js')
    const m1 = { role: 'ai', content: 'a', timestamp: 't1' }
    const m2 = { role: 'user', content: 'b', timestamp: 't2' }
    const first = buildMessageSync({
      syncGeneration: 0,
      messages: [m1],
      lastMessageCount: 0,
    })
    assert.deepEqual(first.messages, [m1])
    assert.equal(first.messages_unchanged, undefined)

    const inc = buildMessageSync({
      syncGeneration: 2,
      messages: [m1, m2],
      lastMessageCount: 1,
    })
    assert.equal(inc.messages_unchanged, undefined)
    assert.equal(inc.message_patches.length, 1)
    assert.equal(inc.message_patches[0].op, 'append')
    assert.deepEqual(inc.message_patches[0].messages, [m2])
  })

  it('PanelState applies message_patches to hubTimeline', () => {
    const { PanelState } = require('../out/webview/panelState.js')
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      message_patches: [{
        op: 'append',
        messages: [{ role: 'ai', content: 'patched', timestamp: 't' }],
      }],
      pending_sessions: [],
      hub: {},
    })
    assert.equal(state.hubTimeline.length, 1)
    assert.equal(state.hubTimeline[0].content, 'patched')
  })
})

describe('5 postDeployReload steps', () => {
  it('buildPostDeployReloadSteps lists reload and mcp toggle', () => {
    const { buildPostDeployReloadSteps } = require('../out/postDeployReload.js')
    const steps = buildPostDeployReloadSteps('2.5.1-ji.70')
    assert.match(steps.join(' '), /Reload Window/)
    assert.match(steps.join(' '), /MCP/)
    assert.match(steps.join(' '), /2\.5\.1-ji\.70/)
  })
})

describe('7 retainContextWhenHidden setting', () => {
  it('resolveRetainContextWhenHidden defaults false', () => {
    const { resolveRetainContextWhenHidden } = require('../out/webviewOptions.js')
    assert.equal(resolveRetainContextWhenHidden(undefined), false)
    assert.equal(resolveRetainContextWhenHidden(true), true)
  })
})

describe('2 webviewDiagnoseHandlers', () => {
  it('buildDebugReport includes trace-filtered log tail', () => {
    const { buildDebugReport } = require('../out/webviewDiagnoseHandlers.js')
    const report = buildDebugReport({
      traceId: 'trace-99',
      extension: { version: '1', port: 1, pid: 1 },
      registry: { entries: [], table: '' },
      mcpLogLines: [
        'line trace=trace-99 ok',
        'line trace=other',
      ],
    })
    assert.equal(report.logTail.mcpServerFiltered.length, 1)
    assert.match(report.logTail.mcpServerFiltered[0], /trace-99/)
    assert.ok(report.diagnoseBundle)
  })
})

describe('1 panelState module split', () => {
  it('panelStateMarkdown exports md helper', () => {
    const { attachPanelStateMarkdown } = require('../out/webview/panelStateMarkdown.js')
    class PS {}
    attachPanelStateMarkdown(PS)
    assert.match(PS.md('**bold**'), /<strong>bold<\/strong>/)
  })

  it('panelStateUx exports normalizeQuickReplies', () => {
    const { attachPanelStateUx } = require('../out/webview/panelStateUx.js')
    class PS {}
    attachPanelStateUx(PS)
    assert.ok(PS.DEFAULT_QUICK_REPLIES.length >= 5)
    const merged = PS.normalizeQuickReplies([{ id: 'continue', label: 'Go', text: 'Go on' }])
    assert.equal(merged[0].label, 'Go')
  })
})
