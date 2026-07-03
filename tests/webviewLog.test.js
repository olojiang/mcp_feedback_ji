import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  appendWebviewLog,
  webviewLogPath,
  setWebviewLogDirForTests,
} = require('../out/webviewLog.js')

describe('webviewLog', () => {
  let tmpDir

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-webview-log-'))
    setWebviewLogDirForTests(tmpDir)
  })

  after(() => {
    setWebviewLogDirForTests(null)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('appends lines to webview.log under configured directory', () => {
    appendWebviewLog('onBridgeConnected port=48201')
    appendWebviewLog('requestStateSync')
    const file = webviewLogPath()
    assert.equal(file, path.join(tmpDir, 'webview.log'))
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /onBridgeConnected port=48201/)
    assert.match(text, /requestStateSync/)
  })

  it('includes optional project path prefix', () => {
    appendWebviewLog('hub-connect', '/Users/hunter/Workspace/demo')
    const text = fs.readFileSync(webviewLogPath(), 'utf8')
    assert.match(text, /\[\/Users\/hunter\/Workspace\/demo\] hub-connect/)
  })
})
