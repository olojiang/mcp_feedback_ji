import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'

const require = createRequire(import.meta.url)
const { HOOK_FILES } = require('../out/deploy/hooks.js')

describe('VSIX runtime assets', () => {
  it('includes every hook deployed during extension activation', () => {
    const root = path.join(import.meta.dirname, '..')
    const vsce = path.join(root, 'node_modules', '.bin', 'vsce')
    const packageFiles = new Set(
      execFileSync(vsce, ['ls', '--no-dependencies'], { cwd: root, encoding: 'utf8' })
        .trim()
        .split('\n'),
    )

    for (const file of HOOK_FILES) {
      const asset = `scripts/hooks/${file}`
      assert.ok(packageFiles.has(asset), `${asset} is missing from the VSIX package`)
    }
  })
})
