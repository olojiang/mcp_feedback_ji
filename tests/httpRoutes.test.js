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
    assert.equal(res.headers['content-type'], 'application/json')
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
