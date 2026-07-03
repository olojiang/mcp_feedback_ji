import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ClientRegistry } = require('../out/server/clientRegistry.js')

function fakeWs() {
  return { closed: false, close() { this.closed = true }, ping() {} }
}

describe('ClientRegistry stale sweep logging', () => {
  it('logs skip for stale mcp-server without closing', () => {
    const reg = new ClientRegistry()
    const ws = fakeWs()
    const client = reg.add(ws)
    reg.setClientType(ws, 'mcp-server')
    client.lastPong = Date.now() - 120_000

    const lines = []
    const orig = console.log
    console.log = (msg) => lines.push(String(msg))

    reg.sweepStale(Date.now(), 90_000, () => {})

    console.log = orig
    assert.equal(ws.closed, false)
    assert.ok(lines.some((l) => l.includes('event=stale_sweep') && l.includes('skip') && l.includes('mcp-server')))
  })
})
