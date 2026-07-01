import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { readExtensionVersion } = require('../out/extensionVersion.js')

describe('readExtensionVersion', () => {
  it('reads version from package.json on disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-ext-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '2.5.1-ji.99' }))
    assert.equal(readExtensionVersion(dir), '2.5.1-ji.99')
    fs.rmSync(dir, { recursive: true })
  })

  it('returns 0.0.0 when package.json missing or invalid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-ext-'))
    assert.equal(readExtensionVersion(dir), '0.0.0')
    fs.writeFileSync(path.join(dir, 'package.json'), '{')
    assert.equal(readExtensionVersion(dir), '0.0.0')
    fs.rmSync(dir, { recursive: true })
  })
})
