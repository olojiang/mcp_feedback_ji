import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('extension protocol router (source)', () => {
  it('forwards clipboard handlers through routeAdapter', () => {
    const routeAdapter = readFileSync(join(root, 'src/server/routeAdapter.ts'), 'utf8')
    const messageRouter = readFileSync(join(root, 'src/server/messageRouter.ts'), 'utf8')
    assert.match(routeAdapter, /onClipboardWrite: handlers\.onClipboardWrite/)
    assert.match(routeAdapter, /onClipboardPaste: handlers\.onClipboardPaste/)
    assert.match(messageRouter, /case 'clipboard_write':/)
    assert.match(messageRouter, /case 'clipboard_paste':/)
  })

  it('reads clipboard images via macOS helper in source', () => {
    const wsHub = readFileSync(join(root, 'src/server/wsHub.ts'), 'utf8')
    const clipUtil = readFileSync(join(root, 'src/utils/clipboardImage.ts'), 'utf8')
    assert.match(wsHub, /readClipboardImageBase64/)
    assert.match(clipUtil, /NSPasteboard/)
    assert.doesNotMatch(clipUtil, /require\(['"]electron['"]\)/)
  })
})
