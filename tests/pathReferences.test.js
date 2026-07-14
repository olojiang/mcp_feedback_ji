import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('path reference blocks', () => {
  it('normalizes and deduplicates file and folder references by relative path', () => {
    assert.deepEqual(PanelState.normalizePathReferences([
      { path: 'src/a.ts', kind: 'file' },
      { path: 'src/lib/', kind: 'folder' },
      { path: 'src/a.ts', kind: 'folder' },
      { path: '', kind: 'file' },
    ]), [
      { path: 'src/a.ts', kind: 'file' },
      { path: 'src/lib/', kind: 'folder' },
    ])
  })

  it('serializes blocks as @ relative-path references after the typed message', () => {
    assert.equal(PanelState.composeFeedbackWithPathReferences('Please review', [
      { path: 'src/a.ts', kind: 'file' },
      { path: 'src/lib/', kind: 'folder' },
    ]), 'Please review\n\n@src/a.ts\n@src/lib/')
  })

  it('stores references per session and removes a block as one unit', () => {
    const state = new PanelState()
    state.ensureSession('fb-a', 'A', '', '')
    state.ensureSession('fb-b', 'B', '', '')

    state.setActiveSession('fb-a')
    state.addPathReferences([
      { path: 'src/a.ts', kind: 'file' },
      { path: 'src/lib/', kind: 'folder' },
    ])
    state.removePathReference('src/a.ts')
    assert.deepEqual(state.getPathReferences(), [
      { path: 'src/lib/', kind: 'folder' },
    ])

    state.setActiveSession('fb-b')
    assert.deepEqual(state.getPathReferences(), [])
    state.addPathReferences([{ path: 'README.md', kind: 'file' }])

    const restored = new PanelState()
    restored.deserialize(state.serialize())
    restored.setActiveSession('fb-b')
    assert.deepEqual(restored.getPathReferences(), [
      { path: 'README.md', kind: 'file' },
    ])
  })

  it('includes path-only feedback and clears blocks after queueing', () => {
    const state = new PanelState()
    state.addPathReferences([{ path: 'src/a.ts', kind: 'file' }])

    const commands = state.smartSend('', [], state.getPathReferences())
    const queued = commands.find((command) => command.type === 'ws_send')

    assert.deepEqual(queued.message.comments, ['@src/a.ts'])
    assert.deepEqual(state.getPathReferences(), [])
  })

  it('includes path blocks in live feedback without changing the wire schema', () => {
    const state = new PanelState()
    state.ensureSession('fb-live', 'Live', '', '', { markWaiting: true })
    state.setActiveSession('fb-live')
    state.addPathReferences([{ path: 'src/a.ts', kind: 'file' }])

    const commands = state.smartSend('Review this', [], state.getPathReferences())
    const sent = commands.find((command) => command.type === 'ws_send')

    assert.deepEqual(sent.message, {
      type: 'feedback_response',
      session_id: 'fb-live',
      feedback: 'Review this\n\n@src/a.ts',
      images: [],
    })
    assert.deepEqual(state.getPathReferences(), [])
  })
})
