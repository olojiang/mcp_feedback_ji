import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('panelConnection module wiring', () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'static', 'panel.html'), 'utf8')
  const panelApp = readFileSync(join(import.meta.dirname, '..', 'static', 'panelApp.js'), 'utf8')

  it('loads panelConnection.js and delegates connection UI state to its controller', () => {
    assert.match(html, /\{\{PANELCONNECTION_URI\}\}/)
    assert.match(html, /\{\{PANELAPP_URI\}\}/)
    assert.match(panelApp, /PanelConnectionModule/)
    assert.match(panelApp, /createConnectionController/)
    assert.doesNotMatch(panelApp, /var lastPongAt\s*=/)
    assert.doesNotMatch(panelApp, /var lastHubActivityAt\s*=/)
    assert.doesNotMatch(panelApp, /var connectedHubPid\s*=/)
  })
})
