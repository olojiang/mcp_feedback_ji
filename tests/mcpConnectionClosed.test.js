import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { formatExtensionCloseError } = require('../mcp-server/dist/extensionClient.js')

describe('extensionClient close errors', () => {
  it('formats extension close with actionable hint', () => {
    const msg = formatExtensionCloseError('waiting feedback')
    assert.match(msg, /Extension connection closed/i)
    assert.match(msg, /Reload Window/i)
  })
})
