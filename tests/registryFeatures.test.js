import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  enrichRegistryEntries,
  versionSkewWarnings,
  formatRegistryTable,
} = require('../out/registrySnapshot.js')
const { shouldPromptReloadAfterDeploy } = require('../out/deployStamp.js')

describe('registrySnapshot', () => {
  it('marks alive entries and detects version skew across windows', () => {
    const entries = enrichRegistryEntries([
      { hash: 'a', port: 48201, pid: 100, projectPath: '/ws/a', version: '2.5.1-ji.52', started_at: 1 },
      { hash: 'b', port: 48202, pid: 200, projectPath: '/ws/b', version: '2.5.1-ji.48', started_at: 2 },
    ], (pid) => pid === 100 || pid === 200)

    assert.equal(entries.length, 2)
    assert.equal(entries[0].alive, true)
    const warnings = versionSkewWarnings(entries, '2.5.1-ji.52', 100)
    assert.ok(warnings.some((w) => w.includes('ji.48')))
    assert.ok(warnings.some((w) => w.includes('pid=200')))
  })

  it('formats registry as readable table lines', () => {
    const lines = formatRegistryTable([
      {
        hash: 'abc',
        port: 48201,
        pid: 1,
        projectPath: '/Users/hunter/Workspace/mcp_feedback_ji',
        version: '2.5.1-ji.52',
        started_at: 1,
        alive: true,
      },
    ])
    assert.match(lines.join('\n'), /mcp_feedback_ji/)
    assert.match(lines.join('\n'), /48201/)
  })
})

describe('deployStamp', () => {
  it('prompts reload when deploy stamp version differs from running extension', () => {
    assert.equal(
      shouldPromptReloadAfterDeploy('2.5.1-ji.52', { version: '2.5.1-ji.52', at: Date.now() }),
      false,
    )
    assert.equal(
      shouldPromptReloadAfterDeploy('2.5.1-ji.52', { version: '2.5.1-ji.48', at: Date.now() }),
      true,
    )
    assert.equal(shouldPromptReloadAfterDeploy('2.5.1-ji.52', null), false)
  })

  it('prompts reload when disk version changes between activations', () => {
    const { shouldPromptReloadAfterVersionChange } = require('../out/deployStamp.js')
    assert.equal(shouldPromptReloadAfterVersionChange('2.5.1-ji.48', '2.5.1-ji.52'), true)
    assert.equal(shouldPromptReloadAfterVersionChange('2.5.1-ji.52', '2.5.1-ji.52'), false)
    assert.equal(shouldPromptReloadAfterVersionChange(undefined, '2.5.1-ji.52'), false)
  })
})
