import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extensionJs = readFileSync(join(root, 'out/extension.js'), 'utf8')

describe('extension protocol router', () => {
  it('forwards clipboard handlers through Dp to Tp', () => {
    assert.match(extensionJs, /onClipboardWrite:o\.onClipboardWrite/)
    assert.match(extensionJs, /onClipboardPaste:o\.onClipboardPaste/)
    assert.match(extensionJs, /case"clipboard_write":\{o\.onClipboardWrite&&o\.onClipboardWrite\(e,n\);break\}/)
  })

  it('reads clipboard images via macOS pasteboard helper instead of electron', () => {
    assert.match(extensionJs, /async function Fb_readClipboardImageB64/)
    assert.match(extensionJs, /NSPasteboard\.generalPasteboard/)
    assert.doesNotMatch(extensionJs, /require\("electron"\).*readImage/)
  })
})
