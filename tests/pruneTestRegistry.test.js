import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('pruneTestRegistryEntries', () => {
  const prev = process.env.MCP_FEEDBACK_CONFIG_DIR
  let configDir = ''

  it('removes dead test registry files and skips alive test pids', () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-prune-'))
    process.env.MCP_FEEDBACK_CONFIG_DIR = configDir
    const serversDir = path.join(configDir, 'servers')
    fs.mkdirSync(serversDir, { recursive: true })

    fs.writeFileSync(path.join(serversDir, 'dead.json'), JSON.stringify({
      port: 1,
      pid: 999999,
      projectPath: '/tmp/wire-workspace',
      version: 'test-project-wire',
      started_at: 1,
    }))
    fs.writeFileSync(path.join(serversDir, 'alive.json'), JSON.stringify({
      port: 2,
      pid: process.pid,
      projectPath: '/tmp/full-pipeline-workspace',
      version: 'full-pipeline',
      started_at: 2,
    }))
    fs.writeFileSync(path.join(serversDir, 'real.json'), JSON.stringify({
      port: 3,
      pid: 888888,
      projectPath: '/Users/hunter/ws',
      version: '2.5.1-ji.62',
      started_at: 3,
    }))

    delete require.cache[require.resolve('../out/fileStore.js')]
    const { pruneTestRegistryEntries } = require('../out/fileStore.js')
    const result = pruneTestRegistryEntries((pid) => pid === process.pid)

    assert.deepEqual(result.removed, ['dead'])
    assert.equal(result.skippedAlive.length, 1)
    assert.equal(result.skippedAlive[0].hash, 'alive')
    assert.ok(fs.existsSync(path.join(serversDir, 'real.json')))
    assert.ok(!fs.existsSync(path.join(serversDir, 'dead.json')))
  })

  it('restores env', () => {
    if (prev === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = prev
  })
})
