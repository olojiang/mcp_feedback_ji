import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('panel UX helpers', () => {
  it('DEFAULT_QUICK_REPLIES includes Looks Good and Test Verify', () => {
    const defs = PanelState.DEFAULT_QUICK_REPLIES
    assert.ok(defs.some((q) => q.label === 'Looks Good'))
    assert.ok(defs.some((q) => q.label === 'Continue'))
    assert.ok(defs.some((q) => q.id === 'test-verify'))
    assert.ok(defs.some((q) => q.text.includes('TDD')))
    assert.ok(!defs.some((q) => q.label === 'LGTM'))
  })

  it('normalizeQuickReplies merges custom entries with defaults', () => {
    const merged = PanelState.normalizeQuickReplies([
      { id: 'continue', label: 'Go', text: 'Continue' },
    ])
    assert.equal(merged[0].label, 'Go')
    assert.ok(merged.some((q) => q.id === 'test-verify'))
  })

  it('clampInputPaneHeight respects min max and viewport', () => {
    assert.equal(PanelState.clampInputPaneHeight(50, 800), 120)
    assert.equal(PanelState.clampInputPaneHeight(900, 800), 560)
    assert.equal(PanelState.clampInputPaneHeight(220, 800), 220)
  })

  it('parseStoredInputPaneHeight handles invalid values', () => {
    assert.equal(PanelState.parseStoredInputPaneHeight(null, 600), 220)
    assert.equal(PanelState.parseStoredInputPaneHeight('abc', 600), 220)
    assert.equal(PanelState.parseStoredInputPaneHeight(300, 600), 300)
  })

  it('shouldConfirmFinished only for Finished text when enabled', () => {
    assert.equal(PanelState.shouldConfirmFinished('Finished', true), true)
    assert.equal(PanelState.shouldConfirmFinished('finished', true), true)
    assert.equal(PanelState.shouldConfirmFinished('Continue', true), false)
    assert.equal(PanelState.shouldConfirmFinished('Finished', false), false)
  })

  it('shouldSubmitOnCtrlEnter detects ctrl/meta+enter', () => {
    assert.equal(PanelState.shouldSubmitOnCtrlEnter({ key: 'Enter', ctrlKey: true }, true), true)
    assert.equal(PanelState.shouldSubmitOnCtrlEnter({ key: 'Enter', metaKey: true }, true), true)
    assert.equal(PanelState.shouldSubmitOnCtrlEnter({ key: 'Enter' }, true), false)
    assert.equal(PanelState.shouldSubmitOnCtrlEnter({ key: 'Enter', ctrlKey: true }, false), false)
  })

  it('resolveQuickReplyMode uses fill on shift+click', () => {
    assert.equal(PanelState.resolveQuickReplyMode({ shiftKey: true }), 'fill')
    assert.equal(PanelState.resolveQuickReplyMode({ shiftKey: false }), 'send')
  })

  it('versionSkewBannerText formats first warning', () => {
    const line = PanelState.versionSkewBannerText([
      'Window pid=2 on ji.48 — reload that window',
      'other',
    ])
    assert.match(line, /ji\.48/)
    assert.equal(PanelState.versionSkewBannerText([]), '')
  })

  it('debugSessionTraces lists session id and traceId', () => {
    const ps = new PanelState()
    ps.handleMessage({
      type: 'session_updated',
      session_id: 'fb-t',
      summary: 'q',
      trace_id: 'trace-dbg-1',
    })
    const traces = PanelState.debugSessionTraces(ps)
    assert.deepEqual(traces, [{ id: 'fb-t', traceId: 'trace-dbg-1' }])
  })

  it('messagesScrolledUp when not near bottom', () => {
    const el = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 }
    assert.equal(PanelState.messagesScrolledUp(el, 40), true)
    el.scrollTop = 760
    assert.equal(PanelState.messagesScrolledUp(el, 40), false)
  })

  it('parseQuickRepliesConfig parses label|text lines', () => {
    const parsed = PanelState.parseQuickRepliesConfig('Go|Continue\nLooks Good|Looks good, proceed')
    assert.equal(parsed.length, 2)
    assert.equal(parsed[0].label, 'Go')
    assert.equal(parsed[0].text, 'Continue')
  })
})
