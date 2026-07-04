import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  pendingSessionsFilePath,
  readPersistedPendingSessions,
  writePersistedPendingSessions,
  clearPersistedPendingSessions,
} = require('../out/pendingSessionStore.js')

describe('pendingSessionStore', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-pending-'))
    process.env.MCP_FEEDBACK_CONFIG_DIR = tmpDir
  })

  afterEach(() => {
    delete process.env.MCP_FEEDBACK_CONFIG_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('round-trips pending sessions for a workspace', () => {
    const workspaces = ['/Users/hunter/Workspace/mcp_feedback_ji']
    const sessions = [{
      id: 'fb-restore-1',
      summary: 'waiting question',
      projectDir: workspaces[0],
      traceId: 'trace-abc',
      mcpDetached: true,
      enqueuedAt: Date.now(),
    }]
    writePersistedPendingSessions(workspaces, sessions, {
      pendingComments: ['queued reply'],
      pendingImages: [],
    })
    const file = pendingSessionsFilePath(workspaces)
    assert.ok(fs.existsSync(file))
    const loaded = readPersistedPendingSessions(workspaces)
    assert.deepEqual(loaded?.sessions, sessions)
    assert.deepEqual(loaded?.pendingComments, ['queued reply'])
    assert.deepEqual(loaded?.workspaces, workspaces)
  })

  it('clear removes persisted file', () => {
    const workspaces = ['/proj/a']
    writePersistedPendingSessions(workspaces, [{
      id: 'fb-x', summary: 'q', mcpDetached: false,
    }])
    clearPersistedPendingSessions(workspaces)
    assert.equal(readPersistedPendingSessions(workspaces), null)
  })

  it('returns null for mismatched workspace file', () => {
    writePersistedPendingSessions(['/proj/a'], [{ id: 'fb-a', summary: 'q' }])
    assert.equal(readPersistedPendingSessions(['/proj/b']), null)
  })
})
