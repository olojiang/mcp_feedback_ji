import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const origLoad = Module._load
const providerPath = require.resolve('../out/feedbackViewProvider.js')

function clearProviderCache() {
  for (const key of Object.keys(require.cache)) {
    if (key === providerPath) delete require.cache[key]
  }
}

function makeVscodeStub() {
  const opened = []
  const saved = []
  const executed = []
  return {
    stub: {
      Uri: {
        file: (p) => ({ fsPath: p }),
        joinPath: (base, ...segments) => {
          const root = base.fsPath || String(base)
          const joined = [root, ...segments].join('/')
          return { fsPath: joined, toString: () => joined, with: () => ({ toString: () => joined }) }
        },
      },
      env: { clipboard: { writeText: async () => {} } },
      commands: { executeCommand: async (cmd) => { executed.push(cmd) } },
      workspace: {
        openTextDocument: async (uri) => {
          opened.push(uri.fsPath)
          return { uri }
        },
      },
      window: {
        showTextDocument: async () => {},
        showInformationMessage: async () => {},
        showWarningMessage: async () => {},
        showErrorMessage: async () => {},
        showSaveDialog: async () => {
          const p = path.join(os.tmpdir(), `mcp-export-${Date.now()}.json`)
          saved.push(p)
          return { fsPath: p }
        },
        setStatusBarMessage: () => {},
      },
    },
    opened,
    saved,
    executed,
  }
}

describe('FeedbackViewProvider message handlers', () => {
  const cases = [
    { type: 'hub-connect', expectBridge: true },
    { type: 'get-server-info', expectServerInfo: true },
    { type: 'request-debug', expectDebug: true },
    { type: 'open-log', target: 'extension', expectOpen: /extension\.log$/ },
    { type: 'open-mcp-output', expectMcpOutput: true },
    { type: 'export-sessions', expectExport: true },
    { type: 'log', msg: 'panel line', expectWebviewLog: true },
  ]

  for (const tc of cases) {
    it(`handles ${tc.type}`, async () => {
      const vs = makeVscodeStub()
      Module._load = function (request, parent, isMain) {
        if (request === 'vscode') return vs.stub
        return origLoad.call(this, request, parent, isMain)
      }

      clearProviderCache()
      const { FeedbackViewProvider } = require('../out/feedbackViewProvider.js')
      const posts = []
      let onMessage = null
      const hub = {
        attachWebview: () => ({
          dispose() {},
          deliver() {},
          socket: { on() {} },
        }),
        getDebugInfo: () => ({ workspaces: ['/tmp/ws'], port: 48201, pid: 1 }),
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
          asWebviewUri: (u) => u,
        },
        onDidChangeVisibility: () => {},
        onDidDispose: () => {},
      }
      provider.resolveWebviewView(view, {}, {})

      const payload = { type: tc.type }
      if (tc.target) payload.target = tc.target
      if (tc.msg) payload.msg = tc.msg
      if (tc.type === 'export-sessions') payload.data = { sessions: [] }

      await onMessage(payload)
      await new Promise((r) => setTimeout(r, 50))

      if (tc.expectBridge) {
        assert.ok(posts.some((m) => m.type === 'bridge-connected'))
      }
      if (tc.expectServerInfo) {
        assert.ok(posts.some((m) => m.type === 'server-info'))
      }
      if (tc.expectDebug) {
        assert.ok(posts.some((m) => m.type === 'debug-report'))
      }
      if (tc.expectOpen) {
        assert.ok(vs.opened.some((p) => tc.expectOpen.test(p)))
      }
      if (tc.expectMcpOutput) {
        assert.ok(vs.executed.length > 0 || vs.opened.some((p) => p.includes('mcp-server.log')))
      }
      if (tc.expectExport) {
        assert.equal(vs.saved.length, 1)
        assert.ok(fs.existsSync(vs.saved[0]))
      }

      Module._load = origLoad
    })
  }
})
