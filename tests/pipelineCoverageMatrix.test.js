/**
 * Documents and asserts that every pipeline hop has dedicated test coverage.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = join(root, 'tests')
const testFiles = readdirSync(testsDir).filter((f) => f.endsWith('.test.js'))

const { PipelineHop } = require('../out/pipelineContracts.js')

const HOP_COVERAGE = [
  { hop: PipelineHop.MCP_REQUEST, tests: ['messageRouter.test.js', 'feedbackFlow.test.js', 'fullPipelineChain.integration.test.js'] },
  { hop: PipelineHop.HUB_ENQUEUE, tests: ['feedbackFlow.test.js', 'feedbackManager.test.js'] },
  { hop: PipelineHop.HUB_BROADCAST, tests: ['feedbackDelivery.test.js', 'projectDirectory.pipeline.test.js', 'fullPipelineChain.integration.test.js'] },
  { hop: PipelineHop.UI_RESPONSE, tests: ['panelState.test.js', 'feedbackFlow.test.js', 'fullPipelineChain.integration.test.js'] },
  { hop: PipelineHop.MCP_RESULT, tests: ['fullPipelineChain.integration.test.js', 'feedbackPipeline.integration.test.js'] },
  { hop: PipelineHop.UI_DISPLAYED, tests: ['messageRouter.test.js', 'feedbackDelivery.test.js', 'fullPipelineChain.integration.test.js'] },
]

describe('pipeline coverage matrix', () => {
  for (const { hop, tests } of HOP_COVERAGE) {
    it(`${hop} covered by ${tests.join(', ')}`, () => {
      for (const file of tests) {
        assert.ok(testFiles.includes(file), `missing test file ${file} for hop ${hop}`)
      }
    })
  }

  it('project_directory isolation has dedicated tests', () => {
    const required = [
      'workspaceMatch.test.js',
      'projectDirectory.pipeline.test.js',
      'feedbackFlow.test.js',
      'panelState.test.js',
    ]
    for (const file of required) {
      assert.ok(testFiles.includes(file), `missing ${file}`)
    }
  })
})
