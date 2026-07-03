import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('sessionsToMarkdown', () => {
  it('formats session messages as markdown transcript', () => {
    const ps = new PanelState()
    ps.handleMessage({
      type: 'session_updated',
      session_id: 'fb-1',
      summary: 'Hello agent',
      trace_id: 't-1',
    })
    ps.sessions['fb-1'].messages.push({ role: 'user', content: 'Looks good', ts: 1000 })
    ps.sessions['fb-1'].messages.push({ role: 'ai', content: 'Thanks', ts: 2000 })

    const md = PanelState.sessionsToMarkdown(ps)
    assert.match(md, /# MCP Feedback Sessions/)
    assert.match(md, /fb-1/)
    assert.match(md, /Hello agent/)
    assert.match(md, /Looks good/)
    assert.match(md, /Thanks/)
  })
})

describe('autoGrowTextareaHeight', () => {
  it('clamps height between min and max', () => {
    const el = { style: {}, scrollHeight: 200 }
    PanelState.autoGrowTextareaHeight(el, { minPx: 48, maxPx: 120 })
    assert.equal(el.style.height, '120px')
    el.scrollHeight = 60
    PanelState.autoGrowTextareaHeight(el, { minPx: 48, maxPx: 120 })
    assert.equal(el.style.height, '60px')
  })
})
