import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  versionSkewWarnings,
  isPublishableVersion,
  buildDiagnoseBundle,
} = require('../out/registrySnapshot.js')
const { formatDeployStampLabel } = require('../out/deployStamp.js')

describe('registry skew filter', () => {
  it('ignores test hub versions in versionSkewWarnings', () => {
    const warnings = versionSkewWarnings([
      {
        hash: 't',
        port: 1,
        pid: 99,
        projectPath: '/tmp/full-pipeline-workspace',
        version: 'full-pipeline',
        started_at: 1,
        alive: true,
      },
    ], '2.5.1-ji.61', 200)
    assert.equal(warnings.length, 0)
  })

  it('still warns for publishable version mismatch', () => {
    const warnings = versionSkewWarnings([
      {
        hash: 'r',
        port: 2,
        pid: 100,
        projectPath: '/Users/hunter/ws',
        version: '2.5.1-ji.48',
        started_at: 2,
        alive: true,
      },
    ], '2.5.1-ji.61', 200)
    assert.equal(warnings.length, 1)
  })

  it('isPublishableVersion accepts ji builds only', () => {
    assert.equal(isPublishableVersion('2.5.1-ji.61'), true)
    assert.equal(isPublishableVersion('full-pipeline'), false)
  })

  it('buildDiagnoseBundle wraps payload with generated_at', () => {
    const json = buildDiagnoseBundle({ ok: true })
    assert.match(json, /generated_at/)
    assert.match(json, /"ok": true/)
  })
})

describe('deployStamp label', () => {
  it('formatDeployStampLabel shows deploy time', () => {
    const label = formatDeployStampLabel({ version: '2.5.1-ji.61', at: Date.UTC(2026, 6, 3, 12, 0, 0) }, '2.5.1-ji.61')
    assert.match(label, /deployed 2\.5\.1-ji\.61/)
  })
})
