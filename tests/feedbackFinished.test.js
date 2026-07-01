import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  FINISHED_COMMAND,
  isFinishedMessage,
  sessionTailForFeedback,
} = require('../mcp-server/dist/feedbackSession.js')

describe('feedbackSession Finished gate', () => {
  it('detects Finished command', () => {
    assert.equal(FINISHED_COMMAND, 'finished')
    assert.equal(isFinishedMessage('Finished'), true)
    assert.equal(isFinishedMessage(' finished '), true)
    assert.equal(isFinishedMessage('Finish'), false)
    assert.equal(isFinishedMessage('Continue'), false)
  })

  it('session tail tells agent to continue until Finished', () => {
    assert.match(sessionTailForFeedback('Continue'), /Call interactive_feedback again/)
    assert.match(sessionTailForFeedback('Finished'), /do not call interactive_feedback/)
  })
})
