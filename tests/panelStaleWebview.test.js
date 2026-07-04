import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const root = join(import.meta.dirname, '..')

describe('panel stale webview fix (ji.75)', () => {
  it('panel.html boots vscode api before panelApp', () => {
    const html = readFileSync(join(root, 'static/panel.html'), 'utf8')
    assert.match(html, /window\.__mcpVscode/)
    assert.match(html, /webview-ready.*phase.*early/)
    assert.match(html, /__mcpPendingHostMessages/)
    assert.match(html, /__mcpApplyInlineBridge/)
    assert.match(html, /bootReport/)
  })

  it('panel.html sends webview-ready only once', () => {
    const html = readFileSync(join(root, 'static/panel.html'), 'utf8')
    assert.match(html, /__mcpSendWebviewReady/)
    assert.match(html, /__mcpWebviewReadySent/)
  })

  it('panelApp does not post duplicate webview-ready', () => {
    const panelApp = readFileSync(join(root, 'static/panelApp.js'), 'utf8')
    assert.doesNotMatch(panelApp, /webview-ready posted phase=late/)
  })

  it('feedbackViewProvider handles duplicate webview-ready with reconnect', () => {
    const provider = readFileSync(join(root, 'src/feedbackViewProvider.ts'), 'utf8')
    assert.match(provider, /_webviewReadyAcked/)
    assert.match(provider, /webview-ready reconnect/)
  })

  it('extension forces retainContextWhenHidden false', () => {
    const ext = readFileSync(join(root, 'src/extension.ts'), 'utf8')
    assert.match(ext, /retainContextWhenHidden:\s*false/)
  })

  it('_loadWebviewHtml must not strip script URIs before injection', () => {
    const ext = readFileSync(join(root, 'src/extension.ts'), 'utf8')
    const block = ext.match(/function _loadWebviewHtml[\s\S]*?\n}/)?.[0] || ''
    assert.doesNotMatch(block, /sanitizeUnreplacedWebviewPlaceholders/)
  })
})

describe('webview sanitize timing', () => {
  it('sanitize runs only after URI injection in feedbackViewProvider', () => {
    const provider = readFileSync(join(root, 'src/feedbackViewProvider.ts'), 'utf8')
    const inject = provider.match(/_injectWebviewResources[\s\S]*?return html;/)?.[0] || ''
    const sanitizeIdx = inject.indexOf('sanitizeUnreplacedWebviewPlaceholders')
    const panelAppIdx = inject.indexOf('PANELAPP_URI')
    assert.ok(sanitizeIdx > panelAppIdx, 'sanitize must run after PANELAPP_URI replacement')
  })
})
