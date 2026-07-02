import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('MCP server version reporting', () => {
  it('does not hardcode the MCP stdio server version', () => {
    const source = readFileSync(join(root, 'mcp-server/src/index.ts'), 'utf8')
    assert.doesNotMatch(source, /version:\s*['"]2\.0\.0['"]/)
    assert.match(source, /MCP_FEEDBACK_VERSION/)
    assert.match(source, /Server started version=/)
  })
})
