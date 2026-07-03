import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('panelConnection module wiring', () => {
  const html = readFileSync(join(import.meta.dirname, '..', 'static', 'panel.html'), 'utf8')

  it('loads panelConnection.js and uses ConnectionRenderer', () => {
    assert.match(html, /\{\{PANELCONNECTION_URI\}\}/)
    assert.match(html, /PanelConnectionModule/)
    assert.match(html, /ensureConnectionRenderer/)
    assert.match(html, /createConnectionRenderer/)
  })
})
