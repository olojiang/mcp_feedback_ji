import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildHubSnapshot } = require('../out/hubSnapshot.js')

describe('buildHubSnapshot', () => {
  it('includes workspace isolation metadata per hub instance', () => {
    const snap = buildHubSnapshot({
      port: 48201,
      pid: 100,
      version: '2.5.1-ji.41',
      workspaces: ['/Users/hunter/Workspace/spatial-smart-cc'],
      webviews: 1,
      mcpServers: 1,
      pendingCount: 2,
      pendingSessions: [
        { mcp_detached: false },
        { mcp_detached: true },
      ],
    })
    assert.equal(snap.port, 48201)
    assert.deepEqual(snap.workspaces, ['/Users/hunter/Workspace/spatial-smart-cc'])
    assert.equal(snap.mcp_servers, 1)
    assert.equal(snap.pending_count, 2)
    assert.equal(snap.live_pending_count, 1)
    assert.equal(snap.mcp_detached_count, 1)
  })
})
