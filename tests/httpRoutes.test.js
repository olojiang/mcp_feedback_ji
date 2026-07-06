import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
const { handleHttpRoute } = require('../out/server/httpRoutes.js')

function makeReq(url, method = 'GET') {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  return req
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    writeHead(status) {
      this.statusCode = status
    },
    end(body = '') {
      this.body = body
    },
  }
}

function deps() {
  return {
    port: 48200,
    version: '2.5.1-test',
    pending: {
      read: () => null,
      consume: () => null,
    },
    log: () => {},
  }
}

describe('HTTP route documentation', () => {
  it('serves OpenAPI JSON for local diagnostic endpoints', () => {
    const res = makeRes()
    const handled = handleHttpRoute(makeReq('/openapi.json'), res, deps())

    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    const spec = JSON.parse(res.body)
    assert.equal(spec.openapi, '3.0.3')
    assert.ok(spec.paths['/health'])
    assert.ok(spec.paths['/pending'])
  })

  it('serves a lightweight docs page by default', () => {
    const res = makeRes()
    const handled = handleHttpRoute(makeReq('/docs'), res, deps())

    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['content-type'], /text\/html/)
    assert.match(res.body, /MCP Feedback API/)
    assert.match(res.body, /openapi\.json/)
  })
})

describe('HTTP operational routes', () => {
  it('returns health JSON with version and pid', () => {
    const res = makeRes()
    const handled = handleHttpRoute(makeReq('/health'), res, deps())
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, true)
    assert.equal(body.port, 48200)
    assert.equal(body.version, '2.5.1-test')
    assert.ok(typeof body.pid === 'number')
  })

  it('reads and consumes pending queue over HTTP', () => {
    let store = { comments: ['from hook'], images: [] }
    const pending = {
      read: () => store,
      consume: () => {
        const entry = store
        store = null
        return entry
      },
    }
    const resRead = makeRes()
    handleHttpRoute(makeReq('/pending'), resRead, { ...deps(), pending })
    assert.equal(resRead.statusCode, 200)
    assert.deepEqual(JSON.parse(resRead.body).comments, ['from hook'])

    const resConsume = makeRes()
    handleHttpRoute(makeReq('/pending?consume=1'), resConsume, { ...deps(), pending })
    assert.equal(resConsume.statusCode, 200)

    const resEmpty = makeRes()
    handleHttpRoute(makeReq('/pending'), resEmpty, { ...deps(), pending })
    assert.equal(resEmpty.statusCode, 404)
  })

  it('reports live feedback wait for trace over HTTP', () => {
    const feedback = {
      liveWaitForTrace: (traceId) => (
        traceId === 'trace-abc'
          ? { sessionId: 'fb-1', detached: false }
          : null
      ),
    }
    const resHit = makeRes()
    handleHttpRoute(
      makeReq('/feedback-active?trace_id=trace-abc'),
      resHit,
      { ...deps(), feedback },
    )
    assert.equal(resHit.statusCode, 200)
    assert.deepEqual(JSON.parse(resHit.body), {
      active: true,
      sessionId: 'fb-1',
      detached: false,
    })

    const resMiss = makeRes()
    handleHttpRoute(
      makeReq('/feedback-active?trace_id=other'),
      resMiss,
      { ...deps(), feedback },
    )
    assert.equal(resMiss.statusCode, 404)
  })
})
