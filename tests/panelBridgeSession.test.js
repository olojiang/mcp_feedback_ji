import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { BridgeSessionGate } = require('../out/webview/panelState.js')

describe('BridgeSessionGate', () => {
  it('first connect registers and syncs state once', () => {
    const gate = new BridgeSessionGate()
    assert.deepEqual(gate.onBridgeConnected(), {
      register: true,
      stateSync: true,
      labels: true,
    })
    assert.equal(gate.isReady(), true)
    assert.equal(gate.snapshot().initialized, true)
  })

  it('duplicate connect only updates labels', () => {
    const gate = new BridgeSessionGate()
    gate.onBridgeConnected()
    assert.deepEqual(gate.onBridgeConnected(), {
      register: false,
      stateSync: false,
      labels: true,
    })
  })

  it('reconnect resets and allows a fresh init cycle', () => {
    const gate = new BridgeSessionGate()
    gate.onBridgeConnected()
    gate.resetForReconnect()
    assert.equal(gate.isReady(), false)
    assert.equal(gate.shouldInitFromConnectionEstablished(), true)
    assert.deepEqual(gate.onBridgeConnected(), {
      register: true,
      stateSync: true,
      labels: true,
    })
  })

  it('does not register twice without reconnect', () => {
    const gate = new BridgeSessionGate()
    const first = gate.onBridgeConnected()
    const second = gate.onBridgeConnected()
    assert.equal(first.register, true)
    assert.equal(second.register, false)
    assert.equal(gate.snapshot().registered, true)
  })

  it('guards connection_established and server-info after init', () => {
    const gate = new BridgeSessionGate()
    assert.equal(gate.shouldInitFromConnectionEstablished(), true)
    assert.equal(gate.shouldInitFromServerInfo(), true)
    gate.onBridgeConnected()
    assert.equal(gate.shouldInitFromConnectionEstablished(), false)
    assert.equal(gate.shouldInitFromServerInfo(), false)
  })
})
