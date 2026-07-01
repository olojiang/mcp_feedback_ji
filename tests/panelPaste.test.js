import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PanelState } = require('../out/webview/panelState.js')

describe('PanelState.shouldBlockDuplicatePaste', () => {
  it('blocks while WS paste is pending', () => {
    assert.equal(PanelState.shouldBlockDuplicatePaste(true, 0, 1000), true)
  })

  it('blocks shortly after WS paste started', () => {
    assert.equal(PanelState.shouldBlockDuplicatePaste(false, 1000, 1500), true)
  })

  it('allows paste after cooldown', () => {
    assert.equal(PanelState.shouldBlockDuplicatePaste(false, 1000, 2000), false)
  })
})
