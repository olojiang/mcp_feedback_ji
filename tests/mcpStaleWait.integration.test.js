import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { WebSocket } from 'ws'

const require = createRequire(import.meta.url)
const origLoad = Module._load

function vscodeStub() {
  return {
    env: {
      clipboard: {
        writeText: async () => {},
        readText: async () => '',
      },
    },
  }
}

describe('wsHub mcp stale sweep', () => {
  let hub = null
  let port = 0

  before(async () => {
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') return vscodeStub()
      return origLoad.call(this, request, parent, isMain)
    }
    const hubPath = require.resolve('../out/server/wsHub.js')
    delete require.cache[hubPath]
    const { WsHub } = require('../out/server/wsHub.js')
    hub = new WsHub('mcp-stale-sweep')
    hub.setWorkspaces(['/tmp/mcp-stale-sweep'])
    port = await hub.start()
  })

  after(async () => {
    Module._load = origLoad
    if (hub) await hub.stop()
    hub = null
  })

  it('keeps mcp-server connected after synthetic 120s idle sweep', async () => {
    const mcp = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise((resolve, reject) => {
      mcp.once('open', resolve)
      mcp.once('error', reject)
    })
    mcp.send(JSON.stringify({ type: 'register', clientType: 'mcp-server' }))
    await new Promise((r) => setTimeout(r, 40))

    hub.setClientLastPong(mcp, Date.now() - 120_000)
    hub.staleSweepAt(Date.now())

    assert.equal(mcp.readyState, WebSocket.OPEN)
    assert.equal(hub.getConnectedClients().mcpServers, 1)
    mcp.close()
  })
})
