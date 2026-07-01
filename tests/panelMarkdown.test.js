import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('PanelState.md', () => {
  it('renders lists as ul/li without consecutive br', () => {
    const html = PanelState.md('## Title\n\n- one\n- two')
    assert.ok(html.includes('<ul>'))
    assert.ok(html.includes('<li>one</li>'))
    assert.ok(html.includes('<li>two</li>'))
    assert.ok(!html.includes('<br><br>'))
    assert.ok(!/(<br\s*\/?>){2,}/i.test(html))
  })

  it('trims leading newline inside fenced code blocks', () => {
    const html = PanelState.md('```\nfix: headline\n\nbody line\n```')
    assert.match(html, /<pre><code>fix: headline/)
    assert.ok(!html.includes('<code>\nfix'))
  })

  it('uses compact headings without trailing br', () => {
    const html = PanelState.md('## Section\n\nParagraph text')
    assert.match(html, /<h3>Section<\/h3><p>Paragraph text<\/p>/)
    assert.ok(!html.includes('<br>'))
  })

  it('renders GFM escaped inline code without empty code pills', () => {
    const html = PanelState.md('see `` `commit` `` and `hash`')
    assert.ok(!html.includes('<code> </code>'))
    assert.ok(!html.includes('<code></code>'))
    assert.match(html, /&#96;commit&#96;/)
    assert.match(html, /<code>hash<\/code>/)
    assert.equal((html.match(/<code>/g) || []).length, 1)
  })
})
