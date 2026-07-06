import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('transportMetrics', () => {
  it('computes bridge ratio and primary transport', () => {
    const { buildTransportMetrics } = require('../out/transportMetrics.js')
    const allBridge = buildTransportMetrics({ bridgeWebviews: 2, tcpWebviews: 0, mcpServers: 1 })
    assert.equal(allBridge.primary_transport, 'bridge')
    assert.equal(allBridge.bridge_ratio, 1)

    const mixed = buildTransportMetrics({ bridgeWebviews: 1, tcpWebviews: 1, mcpServers: 0 })
    assert.equal(mixed.primary_transport, 'mixed')
    assert.equal(mixed.bridge_ratio, 0.5)
  })
})

describe('panel TransportMetrics', () => {
  it('tracks bridge vs ws sends', () => {
    const { TransportMetrics } = require('../out/webview/panelState.js')
    const m = new TransportMetrics()
    m.record('bridge')
    m.record('bridge')
    m.record('ws')
    const snap = m.snapshot()
    assert.equal(snap.bridge_sends, 2)
    assert.equal(snap.ws_sends, 1)
    assert.equal(snap.primary_transport, 'mixed')
  })
})

describe('registryLock', () => {
  it('allows same pid to re-acquire lock', () => {
    const { canAcquireRegistryLock } = require('../out/registryLock.js')
    const existing = { pid: 100, port: 48201, acquired_at: 1, workspaces: ['/a'] }
    const owner = { pid: 100, port: 48201, acquired_at: 2, workspaces: ['/a', '/b'] }
    assert.equal(canAcquireRegistryLock(existing, owner, () => true, 5000), true)
  })

  it('blocks when another alive pid holds lock', () => {
    const { canAcquireRegistryLock } = require('../out/registryLock.js')
    const existing = { pid: 100, port: 48201, acquired_at: 1, workspaces: ['/a'] }
    const owner = { pid: 200, port: 48202, acquired_at: 2, workspaces: ['/a'] }
    assert.equal(canAcquireRegistryLock(existing, owner, (pid) => pid === 100, 5000), false)
  })

  it('writeServersBatch writes each workspace hash under its own lock', () => {
    const { writeServersBatch } = require('../out/registryLock.js')
    const written = []
    const locks = []
    const result = writeServersBatch({
      workspaces: ['/ws/a', '/ws/b'],
      info: { port: 48201, pid: 99, version: '2.5.1-ji.67', started_at: 1000 },
      projectHash: (p) => 'hash-' + p.slice(-1),
      readLock: () => null,
      writeLock: (hash, lock) => locks.push({ hash, lock }),
      writeServer: (hash, data) => written.push({ hash, data }),
      isAlive: () => true,
      now: 2000,
    })
    assert.equal(result.ok, true)
    assert.equal(result.hashes.length, 2)
    assert.equal(written.length, 2)
    assert.deepEqual(locks.map((entry) => entry.hash), ['hash-a', 'hash-b'])
    assert.equal(locks[0].lock.pid, 99)
    assert.deepEqual(locks[0].lock.workspaces, ['/ws/a'])
  })

  it('skips batch write when a workspace hash lock is held by other alive pid', () => {
    const { writeServersBatch } = require('../out/registryLock.js')
    const result = writeServersBatch({
      workspaces: ['/ws/a'],
      info: { port: 48202, pid: 200, version: '2.5.1-ji.67', started_at: 1000 },
      projectHash: () => 'h1',
      readLock: (hash) => hash === 'h1'
        ? ({ pid: 100, port: 48201, acquired_at: 1500, workspaces: ['/ws/a'] })
        : null,
      writeLock: () => {},
      writeServer: () => {},
      isAlive: (pid) => pid === 100,
      now: 2000,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'registry_locked')
  })

  it('writeServersBatch permits disjoint alive registry owners', () => {
    const { writeServersBatch } = require('../out/registryLock.js')
    const written = []
    const locks = []
    const result = writeServersBatch({
      workspaces: ['/ws/b'],
      info: { port: 48202, pid: 200, version: '2.5.1-ji.67', started_at: 1000 },
      projectHash: () => 'h2',
      readLock: () => null,
      writeLock: (hash, lock) => locks.push({ hash, lock }),
      writeServer: (hash, data) => written.push({ hash, data }),
      isAlive: (pid) => pid === 100,
      now: 2000,
    })
    assert.equal(result.ok, true)
    assert.equal(written.length, 1)
    assert.equal(locks[0].hash, 'h2')
  })
})

describe('ClientRegistry transportCounts', () => {
  it('counts bridge vs tcp webviews separately', () => {
    const { ClientRegistry } = require('../out/server/clientRegistry.js')
    const reg = new ClientRegistry()
    const bridgeWs = { close() {} }
    const tcpWs = { close() {} }
    const bridge = reg.add(bridgeWs)
    bridge.clientType = 'webview'
    bridge.webviewTransport = 'bridge'
    const tcp = reg.add(tcpWs)
    tcp.clientType = 'webview'
    tcp.webviewTransport = 'tcp'
    const counts = reg.transportCounts()
    assert.equal(counts.bridgeWebviews, 1)
    assert.equal(counts.tcpWebviews, 1)
  })
})
