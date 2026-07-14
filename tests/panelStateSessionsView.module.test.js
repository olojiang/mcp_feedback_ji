import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sessionsViewModule = require('../out/webview/panelStateSessionsView.js')
const { PanelState } = require('../out/webview/panelState.js')

const helperNames = [
  'tabProjectBadge',
  'exportSessionsSnapshot',
  'filterSessionsByQuery',
  'exportAgentContinuationJson',
  'debugSessionTraces',
]

describe('panelStateSessionsView module boundary', () => {
  it('owns the complete read-only session presentation surface', () => {
    for (const helperName of helperNames) {
      assert.equal(typeof sessionsViewModule[helperName], 'function', helperName)
      assert.equal(PanelState[helperName], sessionsViewModule[helperName], helperName)
    }
  })

  it('preserves snapshot and handoff shapes', () => {
    const state = {
      panelWorkspace: '/workspace',
      activeSessionId: 's1',
      sessionOrder: ['s1'],
      sessions: {
        s1: {
          label: 'One', summary: 'Summary', waiting: true,
          projectDirectory: '/workspace/project', traceId: 'trace-1', messages: [],
        },
      },
    }

    const snapshot = sessionsViewModule.exportSessionsSnapshot(state)
    assert.equal(snapshot.panelWorkspace, '/workspace')
    assert.deepEqual(snapshot.sessions[0], {
      id: 's1', label: 'One', summary: 'Summary', waiting: true,
      project_directory: '/workspace/project', traceId: 'trace-1', messages: [],
    })

    const handoff = sessionsViewModule.exportAgentContinuationJson(state)
    assert.equal(handoff.purpose, 'agent_session_handoff')
    assert.equal(handoff.activeSessionId, 's1')
    assert.deepEqual(handoff.sessions, snapshot.sessions)
  })
})
