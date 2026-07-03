import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('panel session UX helpers', () => {
  it('tabProjectBadge shows short project folder name', () => {
    assert.equal(
      PanelState.tabProjectBadge({ projectDirectory: '/Users/hunter/Workspace/mcp_feedback_ji' }),
      'mcp_feedback_ji',
    )
    assert.equal(PanelState.tabProjectBadge({ projectDirectory: '' }), '')
  })

  it('exportSessionsSnapshot includes project_directory per session', () => {
    const ps = new PanelState()
    ps.handleMessage({
      type: 'session_updated',
      session_id: 'fb-1',
      session_label: 'a',
      summary: 'Q',
      project_directory: '/proj/a',
    })
    const snap = PanelState.exportSessionsSnapshot(ps)
    assert.equal(snap.sessions.length, 1)
    assert.equal(snap.sessions[0].project_directory, '/proj/a')
  })

  it('filterSessionsByQuery matches label summary and project', () => {
    const ps = new PanelState()
    ps.handleMessage({
      type: 'session_updated',
      session_id: 'fb-1',
      session_label: 'trace-a',
      summary: 'Hello world',
      project_directory: '/proj/spatial',
    })
    const hits = PanelState.filterSessionsByQuery(ps, 'spatial')
    assert.deepEqual(hits, ['fb-1'])
    assert.deepEqual(PanelState.filterSessionsByQuery(ps, 'missing'), [])
  })
})
