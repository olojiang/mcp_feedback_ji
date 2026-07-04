import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  hubLog,
  flushHubLog,
  resetHubLoggerForTests,
} = require('../out/extensionFileLog.js')
const { localDateKey } = require('../out/dailyRotatingLog.js')

describe('extensionFileLog daily rotation', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-extlog-'))
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
    fs.mkdirSync(path.join(tmpDir, 'logs'), { recursive: true })
    resetHubLoggerForTests()
  })

  afterEach(() => {
    resetHubLoggerForTests()
    delete process.env.MCP_FEEDBACK_CONFIG_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes to extension-YYYY-MM-DD.log with daily rotation', () => {
    hubLog('test-message-one')
    flushHubLog()
    const logsDir = path.join(tmpDir, 'logs')
    const dateKey = localDateKey()
    const expectedFile = path.join(logsDir, `extension-${dateKey}.log`)
    assert.ok(fs.existsSync(expectedFile), 'daily log file should exist')
    const content = fs.readFileSync(expectedFile, 'utf8')
    assert.match(content, /test-message-one/)
  })

  it('creates extension.log symlink pointing to today file', () => {
    hubLog('symlink-test')
    flushHubLog()
    const logsDir = path.join(tmpDir, 'logs')
    const alias = path.join(logsDir, 'extension.log')
    assert.ok(fs.lstatSync(alias).isSymbolicLink(), 'extension.log should be a symlink')
    const target = fs.readlinkSync(alias)
    assert.match(target, /extension-\d{4}-\d{2}-\d{2}\.log/)
  })

  it('does NOT use 2MB size-based rotation', () => {
    hubLog('no-size-rotation')
    flushHubLog()
    const logsDir = path.join(tmpDir, 'logs')
    const oldFile = path.join(logsDir, 'extension.log.old')
    assert.ok(!fs.existsSync(oldFile), 'should not create extension.log.old')
  })
})
