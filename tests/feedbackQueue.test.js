import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

class FeedbackQueue {
  constructor() {
    this.queue = []
    this.byId = new Map()
    this.seq = 0
  }

  _nextId() {
    return `fb-${++this.seq}-${Date.now().toString(36)}`
  }

  enqueue(mcpClient, projectDir, label) {
    const id = this._nextId()
    const promise = new Promise((resolve, reject) => {
      const item = { id, mcpClient, projectDir, label: label || '', summary: '', resolve, reject }
      this.queue.push(item)
      this.byId.set(id, item)
    })
    return { id, promise }
  }

  resolveById(id, result) {
    const item = this.byId.get(id)
    if (!item) return false
    this.byId.delete(id)
    const idx = this.queue.indexOf(item)
    if (idx >= 0) this.queue.splice(idx, 1)
    item.resolve({ ...result, transport: item.mcpClient })
    return true
  }

  getPendingSessions() {
    return this.queue.map((r) => ({ id: r.id, label: r.label || '', summary: r.summary || '' }))
  }
}

describe('FeedbackQueue', () => {
  it('resolves by session id out of order', () => {
    const q = new FeedbackQueue()
    const a = q.enqueue('ws-a', '/proj', 'a')
    const b = q.enqueue('ws-b', '/proj', 'b')
    assert.equal(q.getPendingSessions().length, 2)
    assert.equal(q.resolveById(b.id, { feedback: 'B first' }), true)
    assert.equal(q.getPendingSessions().length, 1)
    assert.equal(q.getPendingSessions()[0].id, a.id)
  })
})
