import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    agentTurnStatusLogLine,
    agentTurnStatusPayload,
} from '../out/agentTurnStatus.js'

describe('agentTurnStatus', () => {
    it('builds webview payload', () => {
        const payload = agentTurnStatusPayload({
            sessionId: 'fb-x',
            reason: 'link_lost',
            detail: 'Cursor Agent 已断开',
            traceId: 'trace-1',
        })
        assert.equal(payload.type, 'agent_turn_status')
        assert.equal(payload.session_id, 'fb-x')
        assert.equal(payload.reason, 'link_lost')
    })

    it('formats log line', () => {
        const line = agentTurnStatusLogLine({
            sessionId: 'fb-x',
            reason: 'cursor_ended',
            detail: 'done',
            traceId: 'trace-1',
        })
        assert.match(line, /event=agent_turn_status/)
        assert.match(line, /trace=trace-1/)
        assert.match(line, /reason=cursor_ended/)
    })
})
