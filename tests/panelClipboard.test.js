import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('PanelState clipboard helpers', () => {
  it('htmlToPlainText converts br and strips tags', () => {
    const plain = PanelState.htmlToPlainText(
      '<h3>Title</h3>Line one<br>Line two<strong>bold</strong>'
    )
    assert.match(plain, /Title/)
    assert.match(plain, /Line one/)
    assert.match(plain, /bold/)
    assert.ok(!plain.includes('<'))
  })

  it('plainCopyText prefers markdown source over html', () => {
    const src = '## Hello\n\n- item one'
    assert.equal(PanelState.plainCopyText(src, '<h3>Hello</h3>'), src)
  })
})

describe('PanelState.extractClipboardImages', () => {
  const fakeFile = { type: 'image/png', name: 'a.png', size: 100 }

  it('detects image from items', () => {
    const images = PanelState.extractClipboardImages({
      items: [{ type: 'image/png', getAsFile: () => fakeFile }],
    })
    assert.equal(images.length, 1)
    assert.equal(images[0], fakeFile)
  })

  it('prefers items over files to avoid duplicate images', () => {
    const images = PanelState.extractClipboardImages({
      files: [fakeFile],
      items: [{ type: 'image/png', getAsFile: () => fakeFile }],
    })
    assert.equal(images.length, 1)
  })

  it('falls back to files when items have no images', () => {
    const images = PanelState.extractClipboardImages({
      files: [fakeFile],
      items: [{ type: 'text/plain' }],
    })
    assert.equal(images.length, 1)
  })

  it('returns empty for text-only clipboard', () => {
    assert.equal(PanelState.extractClipboardImages({ items: [{ type: 'text/plain' }] }).length, 0)
  })
})
