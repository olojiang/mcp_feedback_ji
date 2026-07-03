import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

describe('panel UX feature wiring (static integration)', () => {
  const html = readFileSync(join(root, 'static/panel.html'), 'utf8')

  it('panel.html includes version skew banner, scroll button, and DBG trace map', () => {
    assert.match(html, /id="versionSkewBanner"/)
    assert.match(html, /id="scrollBottomBtn"/)
    assert.match(html, /id="debugSessionTraces"/)
    assert.match(html, /function showVersionSkewBanner/)
    assert.match(html, /function scrollMessagesToBottom/)
    assert.match(html, /shouldSubmitOnCtrlEnter/)
  })

  it('panel.html wires Ctrl+Enter on input keydown', () => {
    assert.match(html, /inputEl\.addEventListener\('keydown'/)
    assert.match(html, /shouldSubmitOnCtrlEnter/)
  })
})
