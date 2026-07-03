import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const root = join(import.meta.dirname, '..')
const panelApp = readFileSync(join(root, 'static/panelApp.js'), 'utf8')

describe('panelApp eruda optional', () => {
  it('does not abort when ErudaPanelModule is missing', () => {
    assert.doesNotMatch(panelApp, /ErudaPanelModule not loaded/)
    assert.match(panelApp, /window\.ErudaPanelModule \|\|/)
    assert.match(panelApp, /loadHeight/)
  })
})

describe('webview-ready bridge broadcast', () => {
  it('stops bridge broadcast timer on webview-ready', () => {
    const router = readFileSync(join(root, 'src/webviewMessageRouter.ts'), 'utf8')
    assert.match(router, /stopBridgeBroadcast/)
    const provider = readFileSync(join(root, 'src/feedbackViewProvider.ts'), 'utf8')
    assert.match(provider, /_broadcastBridgeConnected/)
    assert.match(provider, /_stopBridgeBroadcast/)
  })
})
