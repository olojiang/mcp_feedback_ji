import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  shouldKillMcpServersOnDeploy,
  findMcpServerPids,
} = require('../scripts/deployPolicy.cjs')

describe('deploy MCP kill policy', () => {
  it('does not kill MCP servers on deploy by default', () => {
    assert.equal(shouldKillMcpServersOnDeploy({}), false)
    assert.equal(shouldKillMcpServersOnDeploy({ MCP_FEEDBACK_KILL_MCP_ON_DEPLOY: '0' }), false)
  })

  it('kills only when MCP_FEEDBACK_KILL_MCP_ON_DEPLOY=1', () => {
    assert.equal(shouldKillMcpServersOnDeploy({ MCP_FEEDBACK_KILL_MCP_ON_DEPLOY: '1' }), true)
  })

  it('findMcpServerPids parses ps output and skips current pid', () => {
    const path = '/ext/mcp-server/dist/index.js'
    const ps = `100 node ${path}
200 node other
${process.pid} node ${path}`
    const pids = findMcpServerPids(ps, path, process.pid)
    assert.deepEqual(pids, [100])
  })
})
