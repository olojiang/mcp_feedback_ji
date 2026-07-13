import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { PanelState, storageKeyForWorkspace } = require('../out/webview/panelState.js')

describe('PanelState multi-session', () => {
  it('uses collision-resistant storage keys for workspaces with the same suffix', () => {
    const left = '/Users/hunter/Workspace/team-a/packages/shared/product-ui'
    const right = '/Volumes/External/Workspace/team-b/packages/shared/product-ui'
    assert.notEqual(storageKeyForWorkspace(left), storageKeyForWorkspace(right))
    assert.equal(storageKeyForWorkspace(left), storageKeyForWorkspace(left))
  })

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

  it('addToPending stores drafts in global pending even when a session tab is waiting', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-q',
      session_label: 'q',
      summary: 'Question',
    })
    const cmds = state.addToPending('queued draft', ['img-1'])

    assert.deepEqual(state.sessions['fb-q'].pendingQueue, [])
    assert.deepEqual(state.sessions['fb-q'].pendingImages, [])
    assert.deepEqual(state.globalPendingQueue, ['queued draft'])
    assert.deepEqual(state.globalPendingImages, ['img-1'])
    assert.deepEqual(state.getPendingDisplay(), { comments: ['queued draft'], images: ['img-1'] })
    const ws = cmds.find((c) => c.type === 'ws_send' && c.message.type === 'queue-pending')
    assert.ok(ws)
    assert.deepEqual(ws.message.comments, ['queued draft'])
    assert.deepEqual(ws.message.images, ['img-1'])
    assert.ok(cmds.some((c) => c.type === 'render' && c.targets.includes('pending')))
  })

  it('stages pasted images before any session exists and queues them on send', () => {
    const state = new PanelState()

    const stageCmds = state.stageImage('img-empty-chat')
    assert.deepEqual(state.getStagedImages(), ['img-empty-chat'])
    assert.ok(stageCmds.some((c) => c.type === 'render' && c.targets.includes('staged_images')))

    const sendCmds = state.smartSend('', state.getStagedImages())
    const ws = sendCmds.find((c) => c.type === 'ws_send' && c.message.type === 'queue-pending')
    assert.ok(ws)
    assert.deepEqual(ws.message.images, ['img-empty-chat'])
    assert.deepEqual(state.globalPendingImages, ['img-empty-chat'])
    assert.deepEqual(state.getStagedImages(), [])
  })

  it('queues empty-chat text together with staged pasted images', () => {
    const state = new PanelState()

    state.stageImage('img-with-text')
    const sendCmds = state.smartSend('reply with screenshot', state.getStagedImages())
    const ws = sendCmds.find((c) => c.type === 'ws_send' && c.message.type === 'queue-pending')

    assert.ok(ws)
    assert.deepEqual(ws.message.comments, ['reply with screenshot'])
    assert.deepEqual(ws.message.images, ['img-with-text'])
    assert.deepEqual(state.globalPendingQueue, ['reply with screenshot'])
    assert.deepEqual(state.globalPendingImages, ['img-with-text'])
    assert.deepEqual(state.getStagedImages(), [])
  })

  it('counts images as attachments when displaying pending count', () => {
    assert.equal(PanelState.pendingDisplayCount({ comments: ['reply'], images: ['img'] }), 1)
    assert.equal(PanelState.pendingDisplayCount({ comments: ['one', 'two'], images: ['img'] }), 2)
    assert.equal(PanelState.pendingDisplayCount({ comments: [], images: ['img'] }), 1)
    assert.equal(PanelState.pendingDisplayCount({ comments: [], images: [] }), 0)
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

  it('state_sync auto-submits queued pending when there is one live waiting session', () => {
    const state = new PanelState()
    const result = state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-live', label: 'x', summary: 'waiting summary', waiting: true },
      ],
      pending_comments: ['queued reply'],
      pending_images: ['img-1'],
      feedback_queue_size: 1,
      messages: [],
    })

    assert.equal(state.globalPendingQueue.length, 0)
    assert.equal(state.globalPendingImages.length, 0)
    assert.equal(result.autoSubmit.session_id, 'fb-live')
    assert.equal(result.autoSubmit.text, 'queued reply')
    assert.deepEqual(result.autoSubmit.images, ['img-1'])
    const clearPending = result.commands.find(
      (c) => c.type === 'ws_send' && c.message.type === 'queue-pending',
    )
    assert.deepEqual(clearPending.message.comments, [])
    assert.deepEqual(clearPending.message.images, [])
  })

  it('state_sync keeps queued pending when multiple live waiting sessions are restored', () => {
    const state = new PanelState()
    const result = state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-a', label: 'a', summary: 'A', waiting: true },
        { id: 'fb-b', label: 'b', summary: 'B', waiting: true },
      ],
      pending_comments: ['queued reply'],
      pending_images: [],
      feedback_queue_size: 1,
      messages: [],
    })

    assert.ok(Array.isArray(result))
    assert.deepEqual(state.globalPendingQueue, ['queued reply'])
    assert.equal(state.sessions['fb-a'].waiting, true)
    assert.equal(state.sessions['fb-b'].waiting, true)
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

  it('closing a detached waiting tab dismisses it on the hub so refresh cannot restore it', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-detached', label: 'old', summary: 'Old detached', waiting: true, mcp_detached: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      hub: { workspaces: ['/proj'], pending_count: 1, live_pending_count: 0, mcp_detached_count: 1, mcp_servers: 0 },
      messages: [],
    })

    const cmds = state.closeSession('fb-detached')
    const dismiss = cmds.find((c) => c.type === 'ws_send' && c.message.type === 'dismiss_feedback')

    assert.ok(dismiss)
    assert.equal(dismiss.message.session_id, 'fb-detached')
    assert.equal(state.sessions['fb-detached'], undefined)
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

  it('smartSend routes to live waiting session when active tab is link lost', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-old', label: 'old', summary: 'Old detached', waiting: true, mcp_detached: true },
        { id: 'fb-live', label: 'live', summary: 'Live question', waiting: true, mcp_detached: false },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 2,
      hub: { workspaces: ['/proj'], pending_count: 2, live_pending_count: 1, mcp_detached_count: 1, mcp_servers: 1 },
    })
    state.setActiveSession('fb-old')

    const cmds = state.smartSend('reply to live', [])
    const fr = cmds.find((c) => c.type === 'ws_send' && c.message.type === 'feedback_response')
    const qp = cmds.find((c) => c.type === 'ws_send' && c.message.type === 'queue-pending')
    assert.ok(fr, 'should deliver to a live session instead of queueing on the detached active tab')
    assert.equal(fr.message.session_id, 'fb-live')
    assert.equal(fr.message.feedback, 'reply to live')
    assert.equal(qp, undefined)
    assert.equal(state.activeSessionId, 'fb-live')
  })

  it('state_sync does not infer every pending session is detached from aggregate hub counts', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-old', label: 'old', summary: 'Old detached', waiting: true, mcp_detached: true },
        { id: 'fb-live', label: 'live', summary: 'Live question', waiting: true, mcp_detached: false },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 2,
      hub: { workspaces: ['/proj'], pending_count: 2, live_pending_count: 1, mcp_detached_count: 1, mcp_servers: 1 },
    })

    assert.equal(state.sessions['fb-old'].mcpDetached, true)
    assert.equal(state.sessions['fb-live'].mcpDetached, false)
    assert.equal(state.getUIState().buttonMode, 'send')
  })

  it('state_sync keeps submitted session active instead of jumping to old detached pending', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'session_updated',
      session_id: 'fb-live',
      summary: 'Live question',
    })
    state.handleMessage({
      type: 'feedback_submitted',
      session_id: 'fb-live',
      feedback: 'delivered',
    })

    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-old', label: 'old', summary: 'Old detached', waiting: true, mcp_detached: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      hub: { workspaces: ['/proj'], pending_count: 1, live_pending_count: 0, mcp_detached_count: 1, mcp_servers: 0 },
    })

    assert.equal(state.activeSessionId, 'fb-live')
    assert.equal(state.sessions['fb-live'].waiting, false)
    assert.equal(state.sessions['fb-old'].mcpDetached, true)
    assert.equal(state.getUIState().buttonMode, 'queue_lost')
  })

  it('getUIState does not show Send when only detached sessions are waiting', () => {
    const state = new PanelState()
    state.handleMessage({
      type: 'state_sync',
      pending_sessions: [
        { id: 'fb-detached', label: 'old', summary: 'Old detached', waiting: true, mcp_detached: true },
      ],
      pending_comments: [],
      pending_images: [],
      feedback_queue_size: 1,
      hub: { workspaces: ['/proj'], pending_count: 1, live_pending_count: 0, mcp_detached_count: 1, mcp_servers: 0 },
    })
    state.handleMessage({
      type: 'feedback_submitted',
      session_id: 'fb-resolved',
      feedback: 'done',
    })

    assert.equal(state.getUIState().buttonMode, 'queue_lost')
    assert.equal(state.getUIState().linkLost, true)
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

  // ── Issue fixes ──────────────────────────────────────

  it('closeResolvedSessions migrates draft from removed active resolved to new active', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'a', summary: 'A' })
    state.submitFeedback('done', [], { session_id: 'a' })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'a', feedback: 'done' })
    state.handleMessage({ type: 'session_updated', session_id: 'b', summary: 'B' })
    // active resolved session 'a' with a draft, waiting session 'b' exists
    state.setActiveSession('a')
    state.sessions['a'].inputDraft = 'my unsent text'

    const cmds = state.closeResolvedSessions()
    assert.equal(state.sessions['a'], undefined)
    assert.equal(state.activeSessionId, 'b')
    assert.equal(state.sessions['b'].inputDraft, 'my unsent text')
    const setInput = cmds.find((c) => c.type === 'dom' && c.action === 'set_input')
    assert.ok(setInput)
    assert.equal(setInput.value, 'my unsent text')
  })

  it('closeResolvedSessions does not overwrite existing draft on new active', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'a', summary: 'A' })
    state.submitFeedback('done', [], { session_id: 'a' })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'a', feedback: 'done' })
    state.handleMessage({ type: 'session_updated', session_id: 'b', summary: 'B' })
    state.setActiveSession('a')
    state.sessions['a'].inputDraft = 'unsent on a'
    state.sessions['b'].inputDraft = 'already on b'

    state.closeResolvedSessions()
    assert.equal(state.sessions['b'].inputDraft, 'already on b')
  })

  it('closeResolvedSessions preserves draft when active is waiting', () => {
    const state = new PanelState()
    state.handleMessage({ type: 'session_updated', session_id: 'a', summary: 'A' })
    state.submitFeedback('done', [], { session_id: 'a' })
    state.handleMessage({ type: 'feedback_submitted', session_id: 'a', feedback: 'done' })
    state.handleMessage({ type: 'session_updated', session_id: 'b', summary: 'B' })
    state.setActiveSession('b')
    state.sessions['b'].inputDraft = 'typing here'

    const cmds = state.closeResolvedSessions()
    assert.equal(state.activeSessionId, 'b')
    assert.equal(state.sessions['b'].inputDraft, 'typing here')
    const setInput = cmds.find((c) => c.type === 'dom' && c.action === 'set_input')
    assert.ok(setInput)
    assert.equal(setInput.value, 'typing here')
  })

  it('relativeFilePath computes path relative to workspace root', () => {
    assert.equal(
      PanelState.relativeFilePath('/proj/src/main.ts', '/proj'),
      'src/main.ts'
    )
    assert.equal(
      PanelState.relativeFilePath('/proj/src/main.ts', '/proj/'),
      'src/main.ts'
    )
    assert.equal(
      PanelState.relativeFilePath('C:\\proj\\src\\main.ts', 'C:\\proj'),
      'src/main.ts'
    )
    assert.equal(
      PanelState.relativeFilePath('/other/path/file.ts', '/proj'),
      '/other/path/file.ts'
    )
    assert.equal(
      PanelState.relativeFilePath('/proj', '/proj'),
      ''
    )
    assert.equal(
      PanelState.relativeFilePath('/proj/file.ts', ''),
      '/proj/file.ts'
    )
    assert.equal(PanelState.relativeFilePath('', '/proj'), '')
    assert.equal(PanelState.relativeFilePath(null, '/proj'), '')
  })

  it('pathFromFileUri extracts filesystem path from file:// URI', () => {
    assert.equal(
      PanelState.pathFromFileUri('file:///Users/hunter/proj/src/main.ts'),
      '/Users/hunter/proj/src/main.ts'
    )
    assert.equal(
      PanelState.pathFromFileUri('file:///C:/Users/hunter/proj/main.ts'),
      'C:/Users/hunter/proj/main.ts'
    )
    assert.equal(
      PanelState.pathFromFileUri('file:///proj/file%20name.ts'),
      '/proj/file name.ts'
    )
    assert.equal(
      PanelState.pathFromFileUri('/already/a/path.ts'),
      '/already/a/path.ts'
    )
    assert.equal(PanelState.pathFromFileUri(''), '')
    assert.equal(PanelState.pathFromFileUri(null), '')
  })

  it('finishedClickAction returns send when confirmation not needed', () => {
    assert.equal(PanelState.finishedClickAction(false, false), 'send')
    assert.equal(PanelState.finishedClickAction(false, true), 'send')
  })

  it('finishedClickAction returns confirm-first on initial click when confirmation enabled', () => {
    assert.equal(PanelState.finishedClickAction(true, false), 'confirm-first')
  })

  it('finishedClickAction returns send when pending confirm token is set', () => {
    assert.equal(PanelState.finishedClickAction(true, true), 'send')
  })
})

describe("PanelState path LRU", () => {
  it("addPathsToLru adds new paths to front", () => {
    assert.deepEqual(PanelState.addPathsToLru([], ["src/foo.ts"], 20), ["src/foo.ts"])
  })

  it("addPathsToLru moves existing path to front (dedupe)", () => {
    var list = ["a.ts", "b.ts", "c.ts"]
    var result = PanelState.addPathsToLru(list, ["a.ts"], 20)
    assert.deepEqual(result, ["a.ts", "b.ts", "c.ts"])
  })

  it("addPathsToLru adds multiple paths keeping newest first", () => {
    var result = PanelState.addPathsToLru([], ["a.ts", "b.ts", "c.ts"], 20)
    assert.deepEqual(result, ["c.ts", "b.ts", "a.ts"])
  })

  it("addPathsToLru caps at max and evicts oldest", () => {
    var list = ["1", "2", "3"]
    var result = PanelState.addPathsToLru(list, ["4", "5"], 4)
    assert.deepEqual(result, ["5", "4", "1", "2"])
    assert.equal(result.length, 4)
  })

  it("addPathsToLru ignores empty strings", () => {
    assert.deepEqual(PanelState.addPathsToLru([], ["", "x.ts"], 20), ["x.ts"])
  })

  it("addPathsToLru handles dedupe across batch", () => {
    var result = PanelState.addPathsToLru(["x.ts"], ["x.ts", "y.ts"], 20)
    assert.deepEqual(result, ["y.ts", "x.ts"])
  })

  it("removeFromPathLru removes matching path", () => {
    assert.deepEqual(PanelState.removeFromPathLru(["a", "b", "c"], "b"), ["a", "c"])
  })

  it("removeFromPathLru returns same list if path not found", () => {
    assert.deepEqual(PanelState.removeFromPathLru(["a", "b"], "z"), ["a", "b"])
  })

  it("removeFromPathLru handles empty list", () => {
    assert.deepEqual(PanelState.removeFromPathLru([], "x"), [])
  })
})

describe("panelApp.js LRU wiring regression", () => {
  it("declares lruPaths and browseBtn before their first usage (no hoisting bug)", () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'static', 'panelApp.js'), 'utf8'
    )
    var declIdx = src.indexOf("var lruPaths = document.getElementById('lruPaths')")
    var useIdx = src.indexOf("renderLruInline()")
    assert.ok(declIdx > 0, 'lruPaths declaration must exist')
    assert.ok(useIdx > 0, 'renderLruInline usage must exist')
    assert.ok(declIdx < useIdx,
      'lruPaths must be declared before renderLruInline usage')

    declIdx = src.indexOf("var browseBtn = document.getElementById('browseBtn')")
    useIdx = src.indexOf("if (browseBtn)")
    assert.ok(declIdx > 0, 'browseBtn declaration must exist')
    assert.ok(useIdx > 0, 'browseBtn usage must exist')
    assert.ok(declIdx < useIdx,
      'browseBtn must be declared before first usage')
  })
})
