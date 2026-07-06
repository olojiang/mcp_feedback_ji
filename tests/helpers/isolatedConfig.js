import { after } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function installIsolatedConfig(prefix = 'mcp-feedback-test-') {
  const previous = process.env.MCP_FEEDBACK_CONFIG_DIR
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir

  after(() => {
    if (previous === undefined) delete process.env.MCP_FEEDBACK_CONFIG_DIR
    else process.env.MCP_FEEDBACK_CONFIG_DIR = previous
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  return tmpDir
}
