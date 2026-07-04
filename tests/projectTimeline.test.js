import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ProjectTimeline } = require('../out/server/projectTimeline.js')
const { projectHash, readProject } = require('../out/fileStore.js')

describe('ProjectTimeline', () => {
  let tmpDir
  let origEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-timeline-'))
    origEnv = process.env.MCP_FEEDBACK_CONFIG_DIR
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    if (origEnv === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = origEnv
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('dispose flushes pending debounced save', async () => {
    const tl = new ProjectTimeline(50, 5000)
    tl.setWorkspaces(['/tmp/test-project'])
    tl.addMessage({ role: 'user', content: 'hello' })

    const hash = projectHash('/tmp/test-project')
    const before = readProject(hash)
    assert.equal(before, null, 'debounced save not yet flushed')

    tl.dispose()

    const after = readProject(hash)
    assert.ok(after, 'dispose flushed the save')
    assert.equal(after.messages.length, 1)
    assert.equal(after.messages[0].content, 'hello')
  })

  it('dispose without pending data does not crash', () => {
    const tl = new ProjectTimeline(50, 5000)
    tl.setWorkspaces(['/tmp/test-project'])
    assert.doesNotThrow(() => tl.dispose())
  })

  it('addMessage caps at messageCap', () => {
    const tl = new ProjectTimeline(3, 100000)
    tl.setWorkspaces(['/tmp/test-project'])
    for (let i = 0; i < 5; i++) {
      tl.addMessage({ role: 'user', content: `msg-${i}` })
    }
    const msgs = tl.getMessages()
    assert.equal(msgs.length, 3)
    assert.equal(msgs[0].content, 'msg-2')
    tl.dispose()
  })
})
