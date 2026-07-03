import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { readClipboardImageBase64 } = require('../out/utils/clipboardImage.js')

describe('clipboardImage', () => {
  let prevPlatform = process.platform

  after(() => {
    Object.defineProperty(process, 'platform', { value: prevPlatform })
  })

  it('returns null on non-darwin without spawning subprocess', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const result = await readClipboardImageBase64()
    assert.equal(result, null)
  })

  it('returns null on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const result = await readClipboardImageBase64()
    assert.equal(result, null)
  })
})
