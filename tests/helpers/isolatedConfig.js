import { after } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Isolate MCP_FEEDBACK_CONFIG_DIR + extension file logs away from the live
 * ~/.config/mcp-feedback-enhanced tree for the current test file.
 */
export function installIsolatedConfig(prefix = 'mcp-feedback-test-') {
  const previous = process.env.MCP_FEEDBACK_CONFIG_DIR
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const logsDir = path.join(tmpDir, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir

  let extensionFileLog
  try {
    extensionFileLog = require('../../out/extensionFileLog.js')
    // Flush any prior logger against the previous log dir, then point at isolated logs.
    extensionFileLog.resetHubLoggerForTests()
    extensionFileLog.setExtensionLogDirForTests(logsDir)
    extensionFileLog.resetHubLoggerForTests()
  } catch {
    extensionFileLog = null
  }

  after(() => {
    if (previous === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = previous
    if (extensionFileLog) {
      try {
        extensionFileLog.flushHubLog()
        extensionFileLog.setExtensionLogDirForTests(null)
        extensionFileLog.resetHubLoggerForTests()
      } catch { /* ignore */ }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  return tmpDir
}
