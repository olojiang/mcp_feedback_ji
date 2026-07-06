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

  it('logs skip for stale mcp-server with active wait without closing', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    client.lastPong = Date.now() - 120_000

    const protectedMcp = new Set([ws])
    reg.sweepStale(Date.now(), 90_000, () => {}, { protectedMcpWs: protectedMcp })
    flushHubLog()

    assert.equal(ws.closed, false)
    const logFile = path.join(tmpDir, 'logs', `extension-${localDateKey()}.log`)
    const content = fs.readFileSync(logFile, 'utf8')
    assert.ok(content.includes('event=stale_sweep') && content.includes('skip') && content.includes('active_wait'))
    assert.ok(content.includes('protected=true'))
    assert.ok(content.includes('time_to_zombie_ms='))
  })

  it('rate-limits repeated active wait skip logs for the same mcp-server', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    const now = Date.now()
    client.lastPong = now - 120_000

    const protectedMcp = new Set([ws])
    reg.sweepStale(now, 90_000, () => {}, {
      protectedMcpWs: protectedMcp,
      protectedSkipLogMs: 300_000,
    })
    reg.sweepStale(now + 30_000, 90_000, () => {}, {
      protectedMcpWs: protectedMcp,
      protectedSkipLogMs: 300_000,
    })
    flushHubLog()

    const logFile = path.join(tmpDir, 'logs', `extension-${localDateKey()}.log`)
    const content = fs.readFileSync(logFile, 'utf8')
    assert.equal((content.match(/action=skip/g) || []).length, 1)
  })

  it('closes orphan stale mcp-server without active wait', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    client.lastPong = Date.now() - 120_000

    reg.sweepStale(Date.now(), 90_000, () => {})
    flushHubLog()

    assert.equal(ws.closed, true)
    const logFile = path.join(tmpDir, 'logs', `extension-${localDateKey()}.log`)
    const content = fs.readFileSync(logFile, 'utf8')
    assert.ok(content.includes('action=close') && content.includes('mcp-server'))
  })

  it('closes zombie mcp-server when idle exceeds mcpZombieMs even if protected', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    client.lastPong = Date.now() - 40 * 60 * 1000

    const protectedMcp = new Set([ws])
    reg.sweepStale(Date.now(), 90_000, () => {}, {
      protectedMcpWs: protectedMcp,
      mcpZombieMs: 35 * 60 * 1000,
    })
    flushHubLog()

    assert.equal(ws.closed, true)
    const logFile = path.join(tmpDir, 'logs', `extension-${localDateKey()}.log`)
    const content = fs.readFileSync(logFile, 'utf8')
    assert.ok(content.includes('zombie_wait'))
  })
})
