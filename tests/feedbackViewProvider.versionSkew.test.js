import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const origLoad = Module._load
const providerPath = require.resolve('../out/feedbackViewProvider.js')

function clearProviderCache() {
  for (const key of Object.keys(require.cache)) {
    if (key === providerPath) delete require.cache[key]
  }
}

describe('FeedbackViewProvider version skew on bridge-connected', () => {
  it('includes versionWarnings in bridge-connected when registry has skew', async () => {
    const vs = {
      Uri: {
        file: (p) => ({ fsPath: p }),
        joinPath: (base, ...segments) => {
          const root = base.fsPath || String(base)
          return { fsPath: [root, ...segments].join('/'), with: () => ({}) }
        },
      },
      env: { clipboard: { writeText: async () => {} } },
      commands: { executeCommand: async () => {} },
      workspace: { openTextDocument: async (uri) => ({ uri }) },
      window: {
        showTextDocument: async () => {},
        showInformationMessage: async () => {},
        showWarningMessage: async () => {},
        showErrorMessage: async () => {},
        showSaveDialog: async () => null,
        setStatusBarMessage: () => {},
      },
    }
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') return vs
      return origLoad.call(this, request, parent, isMain)
    }

    clearProviderCache()
    const { FeedbackViewProvider } = require('../out/feedbackViewProvider.js')
    const posts = []
    let onMessage = null
    const hub = {
      attachWebview: () => ({ dispose() {}, deliver() {}, socket: { on() {} } }),
      getDebugInfo: () => ({ workspaces: ['/tmp/ws'], port: 48201, pid: 100 }),
    }

    const provider = new FeedbackViewProvider(
      () => '<html></html>',
      () => 48201,
      () => '2.5.1-ji.58',
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
        asWebviewUri: (u) => u,
      },
      onDidChangeVisibility: () => {},
      onDidDispose: () => {},
    }
    provider.resolveWebviewView(view, {}, {})

    const fileStore = require('../out/fileStore.js')
    const origList = fileStore.listAllServers
    const origKill = process.kill
    fileStore.listAllServers = () => [{
      hash: 'a', port: 48202, pid: 200, projectPath: '/other', version: '2.5.1-ji.40', started_at: 1,
    }]
    process.kill = function (pid, sig) {
      if (pid === 200) return undefined
      return origKill.call(process, pid, sig)
    }

    try {
      await onMessage({ type: 'hub-connect' })
      const bridge = posts.find((m) => m.type === 'bridge-connected')
      assert.ok(bridge)
      assert.ok(Array.isArray(bridge.versionWarnings))
      assert.ok(bridge.versionWarnings.length > 0)
    } finally {
      fileStore.listAllServers = origList
      process.kill = origKill
      Module._load = origLoad
    }
  })
})
