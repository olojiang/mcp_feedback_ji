import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ClientRegistry } = require('../out/server/clientRegistry.js')

function fakeWs() {
  return {
    closed: false,
    close() {
      this.closed = true
    },
    ping() {},
  }
}

describe('ClientRegistry mcp stale policy', () => {
  it('does not sweep mcp-server clients on idle timeout', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    client.lastPong = Date.now() - 120_000

    const stale = []
    reg.sweepStale(Date.now(), 90_000, (w) => stale.push(w))

    assert.equal(stale.length, 0)
    assert.equal(reg.counts().mcpServers, 1)
    assert.equal(ws.closed, false)
  })

  it('still sweeps idle TCP webview clients', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'webview')
    client.lastPong = Date.now() - 120_000

    const stale = []
    reg.sweepStale(Date.now(), 90_000, (w) => stale.push(w))

    assert.equal(stale.length, 1)
    assert.equal(ws.closed, true)
    assert.equal(reg.counts().webviews, 0)
  })

  it('does not sweep bridge webview clients even when idle', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'webview')
    client.webviewTransport = 'bridge'
    client.lastPong = Date.now() - 200_000

    const stale = []
    reg.sweepStale(Date.now(), 90_000, (w) => stale.push(w))

    assert.equal(stale.length, 0)
    assert.equal(ws.closed, false)
    assert.equal(reg.counts().webviews, 1)
  })
})
