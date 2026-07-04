import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldLogHeartbeat } = require('../mcp-server/dist/feedbackWait.js')

describe('feedbackWait heartbeat log throttle', () => {
  it('logs at tick 1 (first minute)', () => {
    assert.equal(shouldLogHeartbeat(1), true)
  })

  it('logs at tick 2 (second minute)', () => {
    assert.equal(shouldLogHeartbeat(2), true)
  })

  it('logs at tick 5 (five minutes)', () => {
    assert.equal(shouldLogHeartbeat(5), true)
  })

  it('logs at tick 10 (ten minutes)', () => {
    assert.equal(shouldLogHeartbeat(10), true)
  })

  it('logs at tick 30 (thirty minutes)', () => {
    assert.equal(shouldLogHeartbeat(30), true)
  })

  it('logs at tick 60 (one hour)', () => {
    assert.equal(shouldLogHeartbeat(60), true)
  })

  it('does NOT log at tick 3', () => {
    assert.equal(shouldLogHeartbeat(3), false)
  })

  it('does NOT log at tick 7', () => {
    assert.equal(shouldLogHeartbeat(7), false)
  })

  it('does NOT log at tick 15', () => {
    assert.equal(shouldLogHeartbeat(15), false)
  })

  it('does NOT log at tick 45', () => {
    assert.equal(shouldLogHeartbeat(45), false)
  })

  it('logs every 60 ticks after first hour (tick 120)', () => {
    assert.equal(shouldLogHeartbeat(120), true)
  })

  it('does NOT log at tick 90', () => {
    assert.equal(shouldLogHeartbeat(90), false)
  })
})
