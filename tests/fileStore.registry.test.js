import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isTestRegistryEntry, findTestRegistryEntries } = require('../out/fileStore.js')

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
