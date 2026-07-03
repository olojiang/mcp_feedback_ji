import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PendingManager } = require('../out/server/pendingManager.js')

describe('PendingManager', () => {
  it('stores and reads pending comments and images', () => {
    const pm = new PendingManager()
    pm.set(['line one', '  ', 'line two'], ['img-b64'])
    const entry = pm.read()
    assert.deepEqual(entry.comments, ['line one', 'line two'])
    assert.deepEqual(entry.images, ['img-b64'])
  })

  it('clears entry when set with empty payload', () => {
    const pm = new PendingManager()
    pm.set(['hello'], [])
    pm.set([], [])
    assert.equal(pm.read(), null)
  })

  it('consume delivers once and clears entry', () => {
    const pm = new PendingManager()
    const deliveries = []
    pm.onPendingDelivered((d) => deliveries.push(d))
    pm.set(['hook me'], [])
    const consumed = pm.consume()
    assert.deepEqual(consumed.comments, ['hook me'])
    assert.equal(pm.read(), null)
    assert.equal(deliveries.length, 1)
    assert.equal(pm.consume(), null)
  })

  it('clear removes pending without delivery callback', () => {
    const pm = new PendingManager()
    let delivered = false
    pm.onPendingDelivered(() => { delivered = true })
    pm.set(['x'], [])
    pm.clear()
    assert.equal(pm.read(), null)
    assert.equal(delivered, false)
  })
})
