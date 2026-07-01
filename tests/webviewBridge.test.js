import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createWebviewBridge } from '../out/server/webviewBridge.js'

describe('webviewBridge', () => {
  it('delivers inbound messages to hub handlers', () => {
    const outbound = []
    const bridge = createWebviewBridge((msg) => outbound.push(msg))
    const received = []
    bridge.socket.on('message', (raw) => received.push(raw))

    bridge.deliver(JSON.stringify({ type: 'ping' }))
    assert.equal(received.length, 1)
    assert.match(String(received[0]), /"ping"/)
  })

  it('posts outbound JSON to panel callback', () => {
    const outbound = []
    const bridge = createWebviewBridge((msg) => outbound.push(msg))
    bridge.socket.send(JSON.stringify({ type: 'connection_established', port: 48201 }))
    assert.equal(outbound.length, 1)
    assert.equal(outbound[0].type, 'connection_established')
    assert.equal(outbound[0].port, 48201)
    bridge.dispose()
  })
})
