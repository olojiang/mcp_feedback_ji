import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildDefaultWebviewHandlers } = require('../out/webviewMessageRouter.js')

describe('webview path browser', () => {
  it('returns relative paths with file and folder kinds', async () => {
    const posted = []
    const selected = [
      { fsPath: '/workspace/src/a.ts' },
      { fsPath: '/workspace/src/lib' },
    ]
    const vscodeApi = {
      FileType: { File: 1, Directory: 2 },
      commands: { executeCommand: async () => {} },
      env: { clipboard: { writeText: async () => {} } },
      window: {
        showOpenDialog: async (options) => {
          assert.equal(options.canSelectFiles, true)
          assert.equal(options.canSelectFolders, true)
          assert.equal(options.canSelectMany, true)
          return selected
        },
        showInformationMessage: () => {},
        showWarningMessage: () => {},
        showErrorMessage: () => {},
        setStatusBarMessage: () => {},
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
        asRelativePath: (uri) => uri.fsPath.replace('/workspace/', ''),
        fs: {
          stat: async (uri) => ({
            type: uri.fsPath.endsWith('/lib') ? 2 : 1,
          }),
        },
      },
    }
    const handlers = buildDefaultWebviewHandlers(vscodeApi)

    await handlers['browse-paths'](
      { type: 'browse-paths', canSelectFiles: true, canSelectFolders: true },
      { webview: { postMessage: (message) => posted.push(message) } },
      {},
    )

    assert.deepEqual(posted, [{
      type: 'browse-paths-result',
      paths: ['src/a.ts', 'src/lib/'],
      references: [
        { path: 'src/a.ts', kind: 'file' },
        { path: 'src/lib/', kind: 'folder' },
      ],
    }])
  })
})
