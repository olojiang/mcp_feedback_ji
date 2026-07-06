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

  it('submitFeedback merges and clears session pendingQueue', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-q',
      session_label: 'q',
      summary: 'Question',
    })
    state.addToPending('queued draft', [])
    assert.equal(state.sessions['fb-q'].pendingQueue.length, 1)

    const cmds = state.submitFeedback('final line', [])
    assert.equal(state.sessions['fb-q'].pendingQueue.length, 0)
    const ws = cmds.find((c) => c.type === 'ws_send')
    assert.equal(ws.message.feedback, 'queued draft\n\nfinal line')
    assert.ok(cmds.some((c) => c.type === 'render' && c.targets.includes('pending')))
  })

  it('submits feedback to selected session, not FIFO order', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-1',
      session_label: 'a',
      summary: 'A',
      project_directory: '/proj/a',
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
    assert.equal(ws.message.project_directory, '/proj/a')
    assert.equal(state.sessions['fb-1'].waiting, true)
    state.handleMessage({ type: 'feedback_submitted', session_id: 'fb-1', feedback: 'Reply to A first' })
    assert.equal(state.sessions['fb-1'].waiting, false)
    assert.equal(state.sessions['fb-2'].waiting, true)
  })

  it('state_sync does not re-open a locally resolved session when server pending is empty', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-resolved',
      session_label: 'r',
      summary: 'Question',
    })
    state.submitFeedback('done', [], { session_id: 'fb-resolved' })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'fb-resolved', feedback: 'done' })
    assert.equal(state.sessions['fb-resolved'].waiting, false)

    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 0,
      messages: [],
    })
    state.reconcileLocalAfterServerSync()

    assert.equal(state.sessions['fb-resolved'].waiting, false)
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

  it('connection_established requests state sync from server', () => {
    const state = new PanelState()
    const cmds = state.handleMessage({ type: 'connection_established' })
    const ws = cmds.find((c) => c.type === 'ws_send')
    assert.ok(ws)
    assert.equal(ws.message.type, 'get_state')
  })

  it('activates latest pending session from state sync over a resolved session', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-old',
      session_label: 'old',
      summary: 'Old question',
    })
    state.submitFeedback('done', [], { session_id: 'fb-old' })

    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-new', label: 'new', summary: 'New waiting question', waiting: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      messages: [],
    })

    assert.equal(state.sessions['fb-old'].waiting, false)
    assert.equal(state.sessions['fb-new'].waiting, true)
    assert.equal(state.activeSessionId, 'fb-new')
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

  it('clears stale waiting flags from localStorage on deserialize', () => {
    const state = new PanelState()
    state.deserialize({
      sessions: {
        'fb-stale': {
          id: 'fb-stale',
          label: 'old',
          summary: 'Old',
          messages: [{ role: 'ai', content: 'Old', timestamp: '2026-01-01T00:00:00.000Z' }],
          pendingQueue: [],
          pendingImages: [],
          inputDraft: '',
          stagedImages: [],
          waiting: true,
          createdAt: 1,
        },
      },
      sessionOrder: ['fb-stale'],
      activeSessionId: 'fb-stale',
    })
    assert.equal(state.sessions['fb-stale'].waiting, false)
  })

  it('reconciles stale waiting tabs when state sync arrives', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-stale',
      summary: 'Stale tab',
    })
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-live', label: 'live', summary: 'Live question', waiting: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      messages: [],
    })
    assert.equal(state.sessions['fb-stale'].waiting, false)
    assert.equal(state.sessions['fb-live'].waiting, true)
    assert.equal(state.activeSessionId, 'fb-live')
  })

  it('localStorage restore after state_sync keeps server pending waiting tab', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-live', label: 'live', summary: 'Live question', waiting: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      messages: [],
    })
    const serverPending = state.snapshotServerPendingSessions()
    state.deserialize({
      sessions: {
        'fb-old': {
          id: 'fb-old',
          label: 'old',
          summary: 'Old resolved',
          messages: [{ role: 'ai', content: 'Old', timestamp: '2026-01-01T00:00:00.000Z' }],
          pendingQueue: [],
          pendingImages: [],
          inputDraft: '',
          stagedImages: [],
          waiting: false,
          createdAt: 1,
        },
      },
      sessionOrder: ['fb-old'],
      activeSessionId: 'fb-old',
    })
    state.restoreServerPendingSessions(serverPending)
    state.reconcileLocalAfterServerSync()

    assert.equal(state.sessions['fb-live'].waiting, true)
    assert.equal(state.sessions['fb-old'].waiting, false)
    assert.equal(state.activeSessionId, 'fb-live')
    assert.equal(state.waitingCount, 1)
  })

  it('smartSend routes Continue to latest waiting session when active tab is resolved', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'fb-old', summary: 'Old' })
    state.submitFeedback('done', [], { session_id: 'fb-old' })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'fb-old', feedback: 'done' })
    state.handleMessage({ type: 'session_updated', session_id: 'fb-new', summary: 'New' })
    state.setActiveSession('fb-old')

    const cmds = state.smartSend('Continue', [])
    const ws = cmds.find((c) => c.type === 'ws_send')
    assert.equal(ws.message.session_id, 'fb-new')
    assert.equal(ws.message.feedback, 'Continue')
  })

  it('setActiveSession and state_sync re-render staged_images for active tab', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'fb-a', summary: 'A' })
    state.stageImage('img-a')
    state.handleMessage({ type: 'session_updated', session_id: 'fb-b', summary: 'B' })
    state.stageImage('img-b')

    const switchA = state.setActiveSession('fb-a')
    assert.ok(switchA.some((c) => c.type === 'render' && c.targets.includes('staged_images')))
    assert.deepEqual(state.getStagedImages(), ['img-a'])

    const unstage = state.unstageImage(0)
    assert.ok(unstage.some((c) => c.type === 'render' && c.targets.includes('staged_images')))
    assert.deepEqual(state.getStagedImages(), [])

    state.stageImage('img-a2')
    state.setActiveSession('fb-b')
    assert.deepEqual(state.getStagedImages(), ['img-b'])

    const sync = state.handleMessage({
      type: 'state_sync',
      pending_sessions: [{ id: 'fb-a', label: 'a', summary: 'A', waiting: true }],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      messages: [],
    })
    assert.ok(sync.some((c) => c.type === 'render' && c.targets.includes('staged_images')))
    assert.equal(state.activeSessionId, 'fb-a')
    assert.deepEqual(state.getStagedImages(), ['img-a2'])
  })

  it('clears staged images when server marks session resolved', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'fb-x', summary: 'X' })
    state.stageImage('orphan')
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 0,
      messages: [],
    })
    assert.deepEqual(state.sessions['fb-x'].stagedImages, [])
  })

  it('ignores session_updated for foreign project_directory', () => {
    const state = new PanelState()
    state.panelWorkspace = '/Users/hunter/Workspace/spatial-smart-cc'
    const cmds = state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-foreign',
      summary: 'Should not appear',
      project_directory: '/Users/hunter/Workspace/mcp_feedback_ji',
    })
    assert.equal(state.sessionOrder.length, 0)
    assert.ok(state.routingMismatch)
    assert.ok(cmds.some((c) => c.type === 'notify' && c.message.type === 'routing-mismatch'))
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

  it('submitFeedback on mcpDetached session queues to global pending', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [{
        id: 'fb-detached',
        label: 'd',
        summary: 'wait',
        waiting: true,
        mcp_detached: true,
      }],
      pending_comments: [],
      pending_images: [],
      hub: { workspaces: ['/proj'], mcp_detached_count: 1, pending_count: 1, mcp_servers: 0 },
    })
    assert.equal(state.getUIState().buttonMode, 'queue_lost')
    const cmds = state.submitFeedback('hello', [])
    const qp = cmds.find((c) => c.type === 'ws_send' && c.message.type === 'queue-pending')
    assert.ok(qp)
    assert.ok(qp.message.comments.includes('hello'))
    assert.ok(cmds.some((c) => c.type === 'notify' && c.message.type === 'agent-link-lost-queued'))
    assert.equal(state.sessions['fb-detached'].mcpDetached, true)
  })

  it('syncs mcp_detached from hub snapshot when panel missed agent_turn_status', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [{
        id: 'fb-detached',
        label: 'd',
        summary: 'wait',
        waiting: true,
      }],
      pending_comments: [],
      pending_images: [],
      hub: { workspaces: ['/proj'], mcp_detached_count: 1, pending_count: 1, mcp_servers: 0 },
    })
    assert.equal(state.sessions['fb-detached'].mcpDetached, true)
    assert.equal(state.getUIState().buttonMode, 'queue_lost')
  })

  it('feedback_undelivered reopens waiting tab with link lost state', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-x',
      summary: 'Question',
    })
    state.submitFeedback('my reply', [], { session_id: 'fb-x' })
    assert.equal(state.sessions['fb-x'].waiting, true)
    state.handleMessage({
      type: 'feedback_undelivered',
      session_id: 'fb-x',
      feedback: 'my reply',
      detail: 'Agent link lost',
    })
    assert.equal(state.sessions['fb-x'].waiting, true)
    assert.equal(state.sessions['fb-x'].mcpDetached, true)
    assert.equal(state.getUIState().buttonMode, 'queue_lost')
  })

  it('agent_turn_status marks session cursorEnded and keeps waiting', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-end',
      summary: 'Question',
    })
    const cmds = state.handleMessage({
      type: 'agent_turn_status',
      session_id: 'fb-end',
      reason: 'link_lost',
      detail: 'Cursor Agent 已断开',
    })
    assert.equal(state.sessions['fb-end'].cursorEnded, true)
    assert.equal(state.sessions['fb-end'].mcpDetached, true)
    assert.equal(state.sessions['fb-end'].waiting, true)
    assert.ok(cmds.some((c) => c.type === 'notify' && c.message.type === 'agent-turn-status'))
    assert.ok(cmds.some((c) => c.type === 'render' && c.targets.indexOf('input') >= 0))
    assert.ok(cmds.some((c) => c.type === 'render' && c.targets.indexOf('connection') >= 0))
  })

  it('cursor_ended still sends feedback_response instead of queue-pending', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-cursor-ended',
      summary: 'Question',
    })
    state.handleMessage({
      type: 'agent_turn_status',
      session_id: 'fb-cursor-ended',
      reason: 'cursor_ended',
      detail: 'Agent turn ended but MCP may still be live',
    })
    assert.equal(state.sessions['fb-cursor-ended'].cursorEnded, true)
    assert.equal(state.sessions['fb-cursor-ended'].mcpDetached, false)
    assert.equal(state.getUIState().buttonMode, 'send')
    const cmds = state.submitFeedback('still try deliver', [], { session_id: 'fb-cursor-ended' })
    const fr = cmds.find((c) => c.type === 'ws_send' && c.message.type === 'feedback_response')
    assert.ok(fr, 'should send feedback_response when only cursorEnded')
    assert.equal(fr.message.feedback, 'still try deliver')
  })

  it('submitFeedback blocks duplicate while submitInFlight', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'fb-dup', summary: 'Q' })
    const first = state.submitFeedback('first', [])
    assert.ok(first.some((c) => c.type === 'ws_send' && c.message.type === 'feedback_response'))
    assert.equal(state.sessions['fb-dup'].submitInFlight, true)
    const second = state.submitFeedback('second', [])
    assert.equal(second.length, 0)
    state.handleMessage({ type: 'feedback_submitted', session_id: 'fb-dup', feedback: 'first' })
    assert.equal(state.sessions['fb-dup'].submitInFlight, false)
    assert.equal(state.sessions['fb-dup'].waiting, false)
  })

  it('feedback_undelivered clears submitInFlight', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'fb-und', summary: 'Q' })
    state.submitFeedback('reply', [], { session_id: 'fb-und' })
    assert.equal(state.sessions['fb-und'].submitInFlight, true)
    state.handleMessage({
      type: 'feedback_undelivered',
      session_id: 'fb-und',
      feedback: 'reply',
      detail: 'link lost',
    })
    assert.equal(state.sessions['fb-und'].submitInFlight, false)
    assert.equal(state.sessions['fb-und'].waiting, true)
  })

  it('getUIState shows Send when another tab is waiting but active is resolved', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'fb-wait', summary: 'Q' })
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-done',
      summary: 'Done',
    })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'fb-done', feedback: 'ok' })
    state.setActiveSession('fb-done')
    assert.equal(state.sessions['fb-wait'].waiting, true)
    assert.equal(state.sessions['fb-done'].waiting, false)
    assert.equal(state.getUIState().buttonMode, 'send')
  })

  it('feedback_submitted clears duplicate text from globalPendingQueue', () => {
    const state = new PanelState()
    state.globalPendingQueue = ['hello']
    state.handleMessage({ type: 'session_updated', session_id: 'fb-x', summary: 'Q' })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'fb-x', feedback: 'hello' })
    assert.deepEqual(state.globalPendingQueue, [])
  })

  it('restoreServerGlobalPending prefers server queue over stale local', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [],
      pending_comments: ['from-server'],
      pending_images: ['img-srv'],
      pending_images_count: 1,
      feedback_queue_size: 1,
      messages: [],
    })
    const snap = state.snapshotServerGlobalPending()
    state.globalPendingQueue = ['stale-local']
    state.globalPendingImages = []
    state.restoreServerGlobalPending(snap)
    assert.deepEqual(state.globalPendingQueue, ['from-server'])
    assert.deepEqual(state.globalPendingImages, ['img-srv'])
  })
})
