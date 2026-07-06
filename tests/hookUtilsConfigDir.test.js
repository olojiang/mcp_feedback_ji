import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const HOOK_UTILS_PATH = path.join(import.meta.dirname, '..', 'scripts', 'hooks', 'hook-utils.js')

describe('hook-utils MCP_FEEDBACK_CONFIG_DIR', () => {
  let tmpDir
  let prev

  afterEach(() => {
    if (prev === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = prev
    delete require.cache[HOOK_UTILS_PATH]
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('uses MCP_FEEDBACK_CONFIG_DIR for CONFIG_DIR and SERVERS_DIR', () => {
    prev = process.env.MCP_FEEDBACK_CONFIG_DIR
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hook-cfg-'))
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
    delete require.cache[HOOK_UTILS_PATH]
    const hookUtils = require(HOOK_UTILS_PATH)
    assert.equal(hookUtils.CONFIG_DIR, tmpDir)
    assert.equal(hookUtils.SERVERS_DIR, path.join(tmpDir, 'servers'))
  })
})
