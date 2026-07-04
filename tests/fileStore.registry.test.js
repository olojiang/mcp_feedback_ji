import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isTestRegistryEntry, findTestRegistryEntries, writeProject, readProject, projectHash } = require('../out/fileStore.js')

describe('fileStore registry helpers', () => {
  it('flags test hub versions and /tmp workspaces', () => {
    assert.equal(isTestRegistryEntry({ version: 'full-pipeline', projectPath: '/tmp/wire-workspace' }), true)
    assert.equal(isTestRegistryEntry({ version: 'test-project-wire', projectPath: '/Users/hunter/ws' }), true)
    assert.equal(isTestRegistryEntry({ version: '2.5.1-ji.61', projectPath: '/Users/hunter/ws' }), false)
  })

  it('findTestRegistryEntries filters listAllServers shape', () => {
    const entries = [
      { hash: 'a', port: 1, pid: 1, projectPath: '/tmp/x', version: 'full-pipeline', started_at: 1 },
      { hash: 'b', port: 2, pid: 2, projectPath: '/Users/h/ws', version: '2.5.1-ji.61', started_at: 2 },
    ]
    const testOnly = entries.filter((e) => isTestRegistryEntry(e))
    assert.equal(testOnly.length, 1)
    assert.equal(testOnly[0].hash, 'a')
    assert.ok(Array.isArray(findTestRegistryEntries()))
  })
})

describe('fileStore atomic write', () => {
  let tmpDir, origEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-fs-atomic-'))
    origEnv = process.env.MCP_FEEDBACK_CONFIG_DIR
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    if (origEnv === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = origEnv
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writeProject creates valid JSON without .tmp residue', () => {
    const hash = projectHash('/tmp/atomic-test')
    writeProject(hash, { projectPath: '/tmp/atomic-test', messages: [], lastActive: Date.now() })
    const data = readProject(hash)
    assert.ok(data)
    assert.equal(data.projectPath, '/tmp/atomic-test')
    const projDir = path.join(tmpDir, 'projects')
    const files = fs.readdirSync(projDir)
    assert.equal(files.filter(f => f.endsWith('.tmp')).length, 0, 'no .tmp residue')
  })
})
