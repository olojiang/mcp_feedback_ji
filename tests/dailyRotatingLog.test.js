import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  appendDailyRotatingLog,
  truncateDailyLog,
  dailyLogFilePath,
  legacyLogAliasPath,
  localDateKey,
  pruneOldDailyLogs,
  DAILY_LOG_RETENTION_DAYS,
} = require('../out/dailyRotatingLog.js')

describe('dailyRotatingLog', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-daily-log-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes to webview-YYYY-MM-DD.log and symlinks webview.log', () => {
    const now = new Date('2026-07-03T12:00:00+08:00')
    const written = appendDailyRotatingLog(tmpDir, 'webview', 'line-one', now)
    assert.equal(written, path.join(tmpDir, `webview-${localDateKey(now)}.log`))
    assert.match(fs.readFileSync(written, 'utf8'), /line-one/)
    const alias = legacyLogAliasPath(tmpDir, 'webview')
    assert.ok(fs.lstatSync(alias).isSymbolicLink())
    assert.equal(fs.readlinkSync(alias), path.basename(written))
  })

  it('keeps at most 7 daily files', () => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    for (let i = 0; i < 10; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      appendDailyRotatingLog(tmpDir, 'webview', `day-${i}`, d)
    }
    const daily = fs.readdirSync(tmpDir).filter((f) => /^webview-\d{4}-\d{2}-\d{2}\.log$/.test(f))
    assert.equal(daily.length, DAILY_LOG_RETENTION_DAYS)
  })

  it('truncateDailyLog clears today file only', () => {
    const now = new Date('2026-07-03T15:00:00')
    appendDailyRotatingLog(tmpDir, 'webview', 'before', now)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    appendDailyRotatingLog(tmpDir, 'webview', 'yesterday', yesterday)

    const todayPath = truncateDailyLog(tmpDir, 'webview', now)
    assert.equal(fs.readFileSync(todayPath, 'utf8'), '')
    const yPath = dailyLogFilePath(tmpDir, 'webview', localDateKey(yesterday))
    assert.match(fs.readFileSync(yPath, 'utf8'), /yesterday/)
  })

  it('pruneOldDailyLogs removes files older than retention window', () => {
    const old = path.join(tmpDir, 'webview-2020-01-01.log')
    fs.writeFileSync(old, 'old\n')
    const removed = pruneOldDailyLogs(tmpDir, 'webview', 7, new Date('2026-07-03'))
    assert.deepEqual(removed, ['webview-2020-01-01.log'])
    assert.equal(fs.existsSync(old), false)
  })
})
