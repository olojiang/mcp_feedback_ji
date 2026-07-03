import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('webview placeholder safety', () => {
  it('removes script tags with unreplaced placeholders', () => {
    const { sanitizeUnreplacedWebviewPlaceholders } = require('../out/extensionHelpers.js')
    const html = [
      '<script src="{{PANELSTATE_MARKDOWN_URI}}"></script>',
      '<script src="ok.js"></script>',
      '<script src="{{UNKNOWN_URI}}"></script>',
    ].join('\n')
    const out = sanitizeUnreplacedWebviewPlaceholders(html)
    assert.match(out, /ok\.js/)
    assert.doesNotMatch(out, /\{\{/)
  })
})
