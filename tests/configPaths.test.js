import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadConfigPaths() {
  const modPath = require.resolve('../out/configPaths.js')
  delete require.cache[modPath]
  return require('../out/configPaths.js')
}

describe('configPaths', () => {
  const prev = process.env.MCP_FEEDBACK_CONFIG_DIR

  afterEach(() => {
    if (prev === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = prev
  })

  it('uses MCP_FEEDBACK_CONFIG_DIR when set', () => {
    process.env.MCP_FEEDBACK_CONFIG_DIR = '/tmp/mcp-feedback-isolated'
    const { getConfigDir, getServersDir } = loadConfigPaths()
    assert.equal(getConfigDir(), '/tmp/mcp-feedback-isolated')
    assert.equal(getServersDir(), '/tmp/mcp-feedback-isolated/servers')
  })

  it('defaults to homedir config when env unset', () => {
    delete process.env.MCP_FEEDBACK_CONFIG_DIR
    const { getConfigDir } = loadConfigPaths()
    assert.match(getConfigDir(), /mcp-feedback-enhanced$/)
  })
})
