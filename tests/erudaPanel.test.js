import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const erudaPanel = require('../static/erudaPanel.js')

describe('ErudaPanel height', () => {
  it('defaults to ~1/3 viewport within 1/4..1/2 bounds', () => {
    const h = erudaPanel.defaultHeight(800)
    assert.equal(h, 264)
    const b = erudaPanel.bounds(800)
    assert.equal(b.min, 200)
    assert.equal(b.max, 400)
    assert.ok(h >= b.min && h <= b.max)
  })

  it('clamps saved height to viewport bounds', () => {
    assert.equal(erudaPanel.clampHeight(50, 800), 200)
    assert.equal(erudaPanel.clampHeight(999, 800), 400)
    assert.equal(erudaPanel.clampHeight(300, 800), 300)
  })

  it('persists height via storage', () => {
    const store = new Map()
    const storage = {
      getItem(k) { return store.has(k) ? store.get(k) : null },
      setItem(k, v) { store.set(k, v) },
    }
    erudaPanel.saveHeight(storage, 320, 800)
    assert.equal(erudaPanel.loadHeight(storage, 800), 320)
    erudaPanel.saveHeight(storage, 999, 800)
    assert.equal(erudaPanel.loadHeight(storage, 800), 400)
  })

  it('falls back when storage is missing or invalid', () => {
    assert.equal(erudaPanel.loadHeight(null, 600), erudaPanel.defaultHeight(600))
    const store = new Map()
    const storage = {
      getItem(k) { return store.get(k) },
      setItem(k, v) { store.set(k, v) },
    }
    storage.setItem(erudaPanel.STORAGE_KEY, 'not-a-number')
    assert.equal(erudaPanel.loadHeight(storage, 600), erudaPanel.defaultHeight(600))
  })
})
