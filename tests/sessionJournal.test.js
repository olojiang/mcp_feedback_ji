import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildSessionJournalRecord,
  appendSessionJournalRecord,
  isContinuationEvent,
  sessionJournalPath,
} = require('../out/sessionJournal.js')

describe('sessionJournal', () => {
  it('marks continuation events', () => {
    assert.equal(isContinuationEvent('create'), false)
    assert.equal(isContinuationEvent('trace_steal'), true)
    assert.equal(isContinuationEvent('transport_reuse'), true)
  })

  it('appends JSONL records with cursor trace and workspaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-session-journal-'))
    const record = buildSessionJournalRecord({
      event: 'create',
      feedbackSessionId: 'fb-test',
      cursorTraceId: '9c4aa497-9780-4d04-90ba-d4d748a8ea7a',
      projectDirectory: '/Users/hunter/ws',
      workspaceRoots: ['/Users/hunter/ws'],
      hubPort: 48201,
      hubPid: 100,
      reason: 'new_request',
      summaryPreview: 'hello',
    })
    appendSessionJournalRecord(record, dir)
    const lines = fs.readFileSync(sessionJournalPath(dir), 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)
    const parsed = JSON.parse(lines[0])
    assert.equal(parsed.feedbackSessionId, 'fb-test')
    assert.equal(parsed.cursorTraceId, '9c4aa497-9780-4d04-90ba-d4d748a8ea7a')
    assert.equal(parsed.continuation, false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
