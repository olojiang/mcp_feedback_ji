import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const TESTS_DIR = import.meta.dirname

function testFiles() {
  return fs.readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.js') || name.endsWith('.integration.test.js'))
    .filter((name) => name !== 'testIsolation.test.js')
}

describe('test isolation guardrails', () => {
  it('requires WsHub integration tests to isolate MCP_FEEDBACK_CONFIG_DIR', () => {
    const offenders = []
    for (const name of testFiles()) {
      const filePath = path.join(TESTS_DIR, name)
      const source = fs.readFileSync(filePath, 'utf8')
      if (!source.includes('new WsHub') && !source.includes('hub.start')) continue
      if (source.includes('installIsolatedConfig') || source.includes('MCP_FEEDBACK_CONFIG_DIR')) continue
      offenders.push(name)
    }

    assert.deepEqual(offenders, [])
  })
})
