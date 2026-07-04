import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ClientRegistry } = require('../out/server/clientRegistry.js')
const { resetHubLoggerForTests, flushHubLog } = require('../out/extensionFileLog.js')
const { localDateKey } = require('../out/dailyRotatingLog.js')

function fakeWs() {
  return { closed: false, close() { this.closed = true }, ping() {} }
}

describe('ClientRegistry stale sweep logging', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stale-'))
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
    fs.mkdirSync(path.join(tmpDir, 'logs'), { recursive: true })
    resetHubLoggerForTests()
  })

  afterEach(() => {
    resetHubLoggerForTests()
    delete process.env.MCP_FEEDBACK_CONFIG_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('logs skip for stale mcp-server without closing', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    client.lastPong = Date.now() - 120_000

    reg.sweepStale(Date.now(), 90_000, () => {})
    flushHubLog()

    assert.equal(ws.closed, false)
    const logFile = path.join(tmpDir, 'logs', `extension-${localDateKey()}.log`)
    const content = fs.readFileSync(logFile, 'utf8')
    assert.ok(content.includes('event=stale_sweep') && content.includes('skip') && content.includes('mcp-server'))
  })
})
