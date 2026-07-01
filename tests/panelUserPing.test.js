import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('Panel user ping', () => {
  it('detects ping command case-insensitively', () => {
    assert.equal(PanelState.isPingCommand('ping'), true)
    assert.equal(PanelState.isPingCommand(' PING '), true)
    assert.equal(PanelState.isPingCommand('pong'), false)
    assert.equal(PanelState.isPingCommand('ping extra'), false)
  })

  it('smartSend ping sends transport ping instead of pending queue', () => {
    const state = new PanelState()
    const cmds = state.smartSend('ping', [])
    const ws = cmds.find((c) => c.type === 'ws_send')
    assert.equal(ws.message.type, 'ping')
    assert.ok(cmds.some((c) => c.type === 'dom' && c.action === 'user_ping'))
    assert.ok(cmds.some((c) => c.type === 'dom' && c.action === 'clear_input'))
    assert.equal(state.globalPendingQueue.length, 0)
  })

  it('smartSend ping with images does not send transport ping', () => {
    const state = new PanelState()
    const cmds = state.smartSend('ping', ['img'])
    assert.ok(!cmds.some((c) => c.type === 'ws_send' && c.message.type === 'ping'))
  })
})
