import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

describe('panel UX feature wiring (static integration)', () => {
  const html = readFileSync(join(root, 'static/panel.html'), 'utf8')
  const panelApp = readFileSync(join(root, 'static/panelApp.js'), 'utf8')
  const pathReferences = readFileSync(join(root, 'static/panelPathReferences.js'), 'utf8')

  it('panel.html includes version skew banner, scroll button, and DBG trace map', () => {
    assert.match(html, /id="versionSkewBanner"/)
    assert.match(html, /id="scrollBottomBtn"/)
    assert.match(html, /id="debugSessionTraces"/)
    assert.match(panelApp, /function showVersionSkewBanner/)
    assert.match(panelApp, /function scrollMessagesToBottom/)
    assert.match(panelApp, /shouldSubmitOnCtrlEnter/)
  })

  it('panelApp wires Ctrl+Enter on input keydown', () => {
    assert.match(panelApp, /inputEl\.addEventListener\('keydown'/)
    assert.match(panelApp, /shouldSubmitOnCtrlEnter/)
  })

  it('input textarea stretches with bottom pane (splitter resize)', () => {
    assert.match(html, /\.input-row\{[^}]*align-items:stretch/)
    assert.match(html, /\.input-row textarea\{[^}]*resize:vertical/)
    assert.match(panelApp, /function applyInputPaneHeight/)
    assert.match(panelApp, /setupPaneSplitter/)
  })

  it('renders removable file and folder blocks inside the composer', () => {
    assert.match(html, /id="pathReferences"/)
    assert.match(html, /class="composer-shell"/)
    assert.match(html, /\.path-reference-remove:focus-visible/)
    assert.match(panelApp, /function renderPathReferences/)
    assert.match(pathReferences, /aria-label.*Remove/)
    assert.match(pathReferences, /state\.removePathReference/)
    assert.match(panelApp, /createPathReferenceController/)
  })

  it('refreshes connection health after feedback_submitted with hub pending observability', () => {
    const submittedIdx = panelApp.indexOf("msg.type === 'feedback_submitted'")
    assert.ok(submittedIdx > 0, 'feedback_submitted handler must exist')
    const block = panelApp.slice(submittedIdx, submittedIdx + 900)
    assert.match(block, /renderConnectionHealth\(\)/)
    assert.match(block, /hub_live_pending=/)
    assert.match(block, /waiting_count=/)
  })
})
