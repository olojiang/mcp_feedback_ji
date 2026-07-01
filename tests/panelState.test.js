import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('PanelState multi-session', () => {
  it('creates independent session tabs with session_id', () => {
    const state = new PanelState()
    const cmdsA = state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-1-aaa',
      session_label: 'trace-a',
      summary: 'Question from session A',
    })
    assert.ok(cmdsA.some((c) => c.type === 'render' && c.targets.includes('tabs')))
    assert.equal(state.activeSessionId, 'fb-1-aaa')
    assert.equal(state.sessions['fb-1-aaa'].messages.length, 1)

    const cmdsB = state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-2-bbb',
      session_label: 'trace-b',
      summary: 'Question from session B',
    })
    assert.equal(state.sessionOrder.length, 2)
    assert.equal(state.activeSessionId, 'fb-2-bbb')
    assert.equal(state.sessions['fb-1-aaa'].waiting, true)
  })

  it('submits feedback to selected session, not FIFO order', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-1',
      session_label: 'a',
      summary: 'A',
    })
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-2',
      session_label: 'b',
      summary: 'B',
    })

    state.setActiveSession('fb-1')
    const cmds = state.submitFeedback('Reply to A first', [])
    const ws = cmds.find((c) => c.type === 'ws_send')
    assert.equal(ws.message.session_id, 'fb-1')
    assert.equal(ws.message.feedback, 'Reply to A first')
    assert.equal(state.sessions['fb-1'].waiting, false)
    assert.equal(state.sessions['fb-2'].waiting, true)
  })

  it('syncs pending sessions from server state', () => {
    const state = new PanelState()
    const cmds = state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-9', label: 'x', summary: 'waiting summary', waiting: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      messages: [],
    })
    assert.ok(cmds.length > 0)
    assert.equal(state.sessions['fb-9'].waiting, true)
    assert.equal(state.sessions['fb-9'].messages[0].content, 'waiting summary')
  })

  it('uses legacy session id when session_id missing', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', summary: 'legacy question' })
    assert.equal(state.sessionOrder.length, 1)
    const id = state.sessionOrder[0]
    assert.ok(String(id).startsWith('legacy-'))
  })

  it('closes sessions individually and in bulk', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'a', summary: 'A' })
    state.handleMessage({ type: 'session_updated', session_id: 'b', summary: 'B' })
    state.submitFeedback('done', [], { session_id: 'a' })
    state.setActiveSession('b')

    const closeOne = state.closeSession('a')
    assert.ok(closeOne.some((c) => c.type === 'render' && c.targets.includes('tabs')))
    assert.equal(state.sessionOrder.length, 1)
    assert.equal(state.sessions['a'], undefined)

    const closeResolved = state.closeResolvedSessions()
    assert.equal(closeResolved.length, 0)

    state.handleMessage({ type: 'session_updated', session_id: 'c', summary: 'C' })
    state.submitFeedback('done c', [], { session_id: 'c' })
    state.handleMessage({ type: 'session_updated', session_id: 'd', summary: 'D' })
    state.setActiveSession('d')
    state.closeSessionsToLeft('d')
    assert.deepEqual(state.sessionOrder, ['d'])
    state.closeOtherSessions('d')
    assert.deepEqual(state.sessionOrder, ['d'])
  })

    it('resolveWsUrl updates port after extension restart', () => {
        assert.equal(
            PanelState.resolveWsUrl('ws://127.0.0.1:48203', 48201),
            'ws://127.0.0.1:48201'
        )
        assert.equal(
            PanelState.resolveWsUrl('ws://127.0.0.1:48201', 48201),
            'ws://127.0.0.1:48201'
        )
    })

    it('isValidWsUrl rejects unreplaced placeholders', () => {
        assert.equal(PanelState.isValidWsUrl('ws://127.0.0.1:48201'), true)
        assert.equal(PanelState.isValidWsUrl('{{SERVER_URL}}'), false)
        assert.equal(PanelState.isValidWsUrl(''), false)
    })
})
