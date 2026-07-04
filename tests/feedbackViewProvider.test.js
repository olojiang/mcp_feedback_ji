import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return require('./stubs/vscode.cjs')
  }
  return origLoad.call(this, request, parent, isMain)
}

const { FeedbackViewProvider } = require('../out/feedbackViewProvider.js')
const { setWebviewLogDirForTests } = require('../out/webviewLog.js')

const _tmpLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fvp-test-log-'))
setWebviewLogDirForTests(_tmpLogDir)
after(() => { setWebviewLogDirForTests(null); fs.rmSync(_tmpLogDir, { recursive: true, force: true }) })

function makeProvider() {
  const posts = []
  let onMessage = null
  const hub = {
    attachWebview: () => ({
      dispose() {},
      deliver() {},
      socket: { on() {} },
    }),
    getDebugInfo: () => ({ workspaces: ['/tmp/ws'] }),
  }
  const provider = new FeedbackViewProvider(
    () => '<html></html>',
    () => 48201,
    () => '2.5.1-test',
    () => hub,
    { fsPath: '/ext' },
  )
  const view = {
    visible: true,
    webview: {
      html: '',
      cspSource: 'csp:',
      options: {},
      onDidReceiveMessage: (cb) => { onMessage = cb },
      postMessage: (msg) => posts.push(msg),
      asWebviewUri: (uri) => uri,
    },
    onDidChangeVisibility: () => {},
    onDidDispose: () => {},
  }
  provider.resolveWebviewView(view, {}, {})
  return { provider, posts, onMessage, view }
}

describe('FeedbackViewProvider sync timing', () => {
  it('soft sync does not send please-reconnect when port unchanged and bridge active', () => {
    const { provider, posts, onMessage } = makeProvider()
    onMessage({ type: 'hub-connect' })
    posts.length = 0
    provider.syncServer(48201)
    assert.equal(posts.filter((m) => m.type === 'please-reconnect').length, 0)
    assert.ok(posts.some((m) => m.type === 'server-info'))
  })

  it('hard sync disposes bridge when port changes', () => {
    let bridgeDisposed = false
    let delivered = null
    const posts = []
    let onMessage = null
    const hub = {
      attachWebview: (cb) => {
        const b = {
          dispose() { bridgeDisposed = true },
          deliver(raw) {
            delivered = JSON.parse(raw)
            cb(JSON.parse(raw))
          },
          socket: { on() {} },
        }
        return b
      },
      getDebugInfo: () => ({}),
    }
    const provider = new FeedbackViewProvider(
      () => '<html></html>',
      () => 48201,
      () => '2.5.1-test',
      () => hub,
      { fsPath: '/ext' },
    )
    const view = {
      visible: true,
      webview: {
        html: '',
        cspSource: 'csp:',
        options: {},
        onDidReceiveMessage: (cb) => { onMessage = cb },
        postMessage: (msg) => posts.push(msg),
        asWebviewUri: (uri) => uri,
      },
      onDidChangeVisibility: () => {},
      onDidDispose: () => {},
    }
    provider.resolveWebviewView(view, {}, {})
    onMessage({ type: 'hub-connect' })
    onMessage({ type: 'hub-message', data: { type: 'ping' } })
    assert.equal(delivered.type, 'ping')
    provider.syncServer(48202)
    assert.equal(bridgeDisposed, true)
    assert.equal(posts.filter((m) => m.type === 'please-reconnect').length, 0)
  })
})
