import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  AGENT_RESUME_STALL_MS,
  AGENT_RESUME_STALL_TOAST,
  agentResumeStallLogLine,
  scheduleAgentResumeWatch,
} = require('../static/panelAgentResumeWatch.js')

describe('panelAgentResumeWatch', () => {
  it('uses 30s stall threshold', () => {
    assert.equal(AGENT_RESUME_STALL_MS, 30000)
  })

  it('formats agent_resume_stall log line', () => {
    const line = agentResumeStallLogLine('fb-test', 2)
    assert.match(line, /event=agent_resume_stall/)
    assert.match(line, /session=fb-test/)
    assert.match(line, /waiting_count=2/)
  })

  it('scheduleAgentResumeWatch clears prior timer and fires callback', () => {
    let cleared = 0
    let fired = false
    const handle = scheduleAgentResumeWatch(
      () => { cleared++ },
      (fn, ms) => {
        assert.equal(ms, AGENT_RESUME_STALL_MS)
        fn()
        return 1
      },
      AGENT_RESUME_STALL_MS,
      () => { fired = true },
    )
    assert.equal(cleared, 1)
    assert.equal(fired, true)
    assert.equal(handle, 1)
  })

  it('exposes user-facing stall toast text', () => {
    assert.match(AGENT_RESUME_STALL_TOAST, /Stop the turn/)
  })
})
