import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  extensionSyncDelaysMs,
  EXTENSION_SYNC_DELAY_MS,
} = require('../out/activateSyncPolicy.js')
const {
  shouldDebouncePanelReconnect,
  panelBootstrapAction,
  shouldReconnectWebview,
} = require('../out/webviewSyncPolicy.js')
const { PanelState } = require('../out/webview/panelState.js')

describe('activateSyncPolicy', () => {
  it('schedules a single deferred sync to avoid reconnect storms', () => {
    assert.deepEqual(extensionSyncDelaysMs(), [EXTENSION_SYNC_DELAY_MS])
    assert.equal(extensionSyncDelaysMs().length, 1)
  })
})

describe('panel reconnect timing policy', () => {
  it('debounces duplicate forceReconnect within 1200ms', () => {
    assert.equal(shouldDebouncePanelReconnect(1000, 1500), true)
    assert.equal(shouldDebouncePanelReconnect(1000, 2201), false)
    assert.equal(shouldDebouncePanelReconnect(0, 500), false)
  })

  it('panelState debounce matches policy', () => {
    assert.equal(PanelState.shouldDebounceReconnect(1000, 1500), true)
    assert.equal(PanelState.shouldDebounceReconnect(1000, 2300), false)
  })

  it('bootstrap: duplicate bridge-connected does not re-register', () => {
    const action = panelBootstrapAction(
      { initialized: true, registered: true },
      'bridge-connected-duplicate',
    )
    assert.equal(action.hubConnect, false)
    assert.equal(action.register, false)
    assert.equal(action.stateSync, false)
  })

  it('bootstrap: first webview-ready registers once', () => {
    const action = panelBootstrapAction(
      { initialized: false, registered: false },
      'webview-ready',
    )
    assert.equal(action.register, true)
    assert.equal(action.stateSync, true)
  })

  it('extension soft sync skips reconnect when bridge already active', () => {
    assert.equal(shouldReconnectWebview(48201, 48201, true), false)
    assert.equal(shouldReconnectWebview(48201, 48201, false), true)
  })
})
