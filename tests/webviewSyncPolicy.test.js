import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldReloadWebview, shouldReconnectWebview } = require('../out/webviewSyncPolicy.js')

describe('webviewSyncPolicy', () => {
  it('reloads only when hub port changes', () => {
    assert.equal(shouldReloadWebview(0, 48201), true)
    assert.equal(shouldReloadWebview(48201, 48201), false)
    assert.equal(shouldReloadWebview(48201, 48202), true)
  })

  it('skips reconnect when port unchanged and bridge is active', () => {
    assert.equal(shouldReconnectWebview(48201, 48201, true), false)
    assert.equal(shouldReconnectWebview(48201, 48201, false), true)
    assert.equal(shouldReconnectWebview(48201, 48202, true), true)
  })

  it('debounces panel forceReconnect within 1200ms', () => {
    const { shouldDebouncePanelReconnect } = require('../out/webviewSyncPolicy.js')
    assert.equal(shouldDebouncePanelReconnect(1000, 1500), true)
    assert.equal(shouldDebouncePanelReconnect(1000, 2201), false)
  })
})
