import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const require = createRequire(import.meta.url)

describe('disconnectReason', () => {
  it('formats disconnect events with reason tag', () => {
    const { formatDisconnectEvent, connectionIssueForDisconnect } = require('../out/disconnectReason.js')
    assert.match(formatDisconnectEvent('extension_ws_close', { trace: 't1' }), /reason=extension_ws_close/)
    assert.match(connectionIssueForDisconnect('stdio_idle'), /Settings/)
    assert.match(connectionIssueForDisconnect('hub_sweep'), /hub stale sweep/i)
  })
})

describe('logTail', () => {
  it('reads last N lines from a file', () => {
    const { readLogTailLines } = require('../out/logTail.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-log-tail-'))
    const file = path.join(dir, 'test.log')
    fs.writeFileSync(file, 'line1\nline2\nline3\nline4\n', 'utf8')
    assert.deepEqual(readLogTailLines(file, 2), ['line3', 'line4'])
    assert.deepEqual(readLogTailLines('/no/such/file.log'), [])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('quickReplySettings', () => {
  it('merges workspace overrides onto defaults by id', () => {
    const { quickRepliesFromConfig } = require('../out/quickReplySettings.js')
    const list = quickRepliesFromConfig([
      { id: 'continue', label: 'Go', text: 'Keep going' },
    ])
    const cont = list.find((q) => q.id === 'continue')
    assert.equal(cont.label, 'Go')
    assert.equal(cont.text, 'Keep going')
    const finished = list.find((q) => q.id === 'finished')
    assert.equal(finished.text, 'Finished')
  })
})

describe('deployReloadBanner', () => {
  it('shows banner when memory version lags disk', () => {
    const { deployReloadBannerText } = require('../out/deployStamp.js')
    const text = deployReloadBannerText('2.5.1-ji.37', '2.5.1-ji.65', null)
    assert.match(text, /Running 2\.5\.1-ji\.37/)
    assert.match(text, /2\.5\.1-ji\.65/)
  })
})

describe('exportAgentContinuationJson', () => {
  it('includes handoff purpose and active session', () => {
    const { PanelState } = require('../out/webview/panelState.js')
    const ps = new PanelState()
    ps.sessions.s1 = {
      label: 'Chat 1',
      summary: 'hi',
      waiting: true,
      messages: [{ role: 'ai', content: 'hello' }],
      projectDirectory: '/ws/a',
      traceId: 't-1',
    }
    ps.sessionOrder = ['s1']
    ps.activeSessionId = 's1'
    const json = PanelState.exportAgentContinuationJson(ps)
    assert.equal(json.purpose, 'agent_session_handoff')
    assert.equal(json.activeSessionId, 's1')
    assert.equal(json.sessions.length, 1)
    assert.match(json.resumeHint, /context/i)
  })
})
