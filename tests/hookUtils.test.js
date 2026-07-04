import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const hookUtils = require('../scripts/hooks/hook-utils.js')

describe('hook-utils', () => {
  describe('readJSON', () => {
    let tmpDir

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hook-rj-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('returns parsed JSON for valid file', () => {
      const f = path.join(tmpDir, 'test.json')
      fs.writeFileSync(f, '{"key":"value"}')
      assert.deepEqual(hookUtils.readJSON(f), { key: 'value' })
    })

    it('returns null for missing file', () => {
      assert.equal(hookUtils.readJSON(path.join(tmpDir, 'nope.json')), null)
    })

    it('returns null for invalid JSON', () => {
      const f = path.join(tmpDir, 'bad.json')
      fs.writeFileSync(f, 'not json')
      assert.equal(hookUtils.readJSON(f), null)
    })
  })

  describe('workspaceKey', () => {
    it('returns first root without trailing slash', () => {
      assert.equal(hookUtils.workspaceKey(['/Users/x/proj/']), '/Users/x/proj')
    })

    it('returns _global for empty array', () => {
      assert.equal(hookUtils.workspaceKey([]), '_global')
    })

    it('returns _global for undefined', () => {
      assert.equal(hookUtils.workspaceKey(undefined), '_global')
    })
  })

  describe('readFeedbackState / writeFeedbackState', () => {
    let origFile, tmpDir, tmpFile

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hook-fs-'))
      tmpFile = path.join(tmpDir, 'feedback-state.json')
      origFile = hookUtils.FEEDBACK_STATE_FILE
      Object.defineProperty(hookUtils, 'FEEDBACK_STATE_FILE', {
        value: tmpFile, writable: true, configurable: true,
      })
    })

    afterEach(() => {
      Object.defineProperty(hookUtils, 'FEEDBACK_STATE_FILE', {
        value: origFile, writable: true, configurable: true,
      })
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('reads empty state when no file exists', () => {
      const state = hookUtils.readFeedbackState('_global')
      assert.deepEqual(state, {})
    })

    it('round-trips feedback state per workspace key', () => {
      hookUtils.writeFeedbackState({ toolsSinceFeedback: 5, lastToolAt: 123 }, '/proj/a')
      const state = hookUtils.readFeedbackState('/proj/a')
      assert.equal(state.toolsSinceFeedback, 5)
      assert.equal(state.lastToolAt, 123)
    })

    it('isolates different workspace keys', () => {
      hookUtils.writeFeedbackState({ toolsSinceFeedback: 1 }, '/proj/a')
      hookUtils.writeFeedbackState({ toolsSinceFeedback: 9 }, '/proj/b')
      assert.equal(hookUtils.readFeedbackState('/proj/a').toolsSinceFeedback, 1)
      assert.equal(hookUtils.readFeedbackState('/proj/b').toolsSinceFeedback, 9)
    })
  })

  describe('readEnforcementConfig', () => {
    it('returns defaults when no config file', () => {
      const cfg = hookUtils.readEnforcementConfig()
      assert.equal(cfg.maxToolCalls, hookUtils.DEFAULT_ENFORCEMENT.maxToolCalls)
      assert.equal(cfg.maxMinutes, hookUtils.DEFAULT_ENFORCEMENT.maxMinutes)
    })
  })

  describe('findServer', () => {
    it('returns null when servers dir does not exist', () => {
      const origServersDir = hookUtils.SERVERS_DIR
      Object.defineProperty(hookUtils, 'SERVERS_DIR', {
        value: '/tmp/nonexistent-mcp-servers-' + Date.now(),
        writable: true, configurable: true,
      })
      const result = hookUtils.findServer(['/some/workspace'])
      Object.defineProperty(hookUtils, 'SERVERS_DIR', {
        value: origServersDir,
        writable: true, configurable: true,
      })
      assert.equal(result, null)
    })
  })

  describe('output', () => {
    it('writes JSON to stdout', () => {
      const orig = process.stdout.write
      let captured = ''
      process.stdout.write = (data) => { captured = data; return true }
      hookUtils.output({ test: true })
      process.stdout.write = orig
      assert.equal(JSON.parse(captured).test, true)
    })
  })
})
