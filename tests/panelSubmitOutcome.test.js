import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    panelSubmitDeliveredLogLine,
    panelSubmitNoEffectLogLine,
    feedbackSubmittedBroadcastLogLine,
    feedbackUndeliveredBroadcastLogLine,
} from '../out/panelSubmitOutcome.js'

describe('panelSubmitOutcome logs', () => {
    it('formats no-effect line with reason and session', () => {
        const line = panelSubmitNoEffectLogLine({
            reason: 'session_not_on_hub_queue',
            sessionId: 'fb-test-p7tn9g',
            feedbackLen: 2,
            pendingCount: 0,
            detail: 'panel_tab_waiting_locally_but_hub_has_no_matching_pending',
        })
        assert.match(line, /event=panel_submit_no_effect/)
        assert.match(line, /reason=session_not_on_hub_queue/)
        assert.match(line, /session=fb-test-p7tn9g/)
        assert.match(line, /pending_count=0/)
    })

    it('formats delivered line', () => {
        const line = panelSubmitDeliveredLogLine({
            sessionId: 'fb-test',
            feedbackLen: 10,
            mcpWsReadyState: 1,
        })
        assert.match(line, /event=panel_submit_delivered/)
        assert.match(line, /mcp_ws_ready_state=1/)
    })

    it('formats feedback_submitted broadcast line', () => {
        const line = feedbackSubmittedBroadcastLogLine({
            sessionId: 'fb-test',
            traceId: 'trace-abc',
            feedbackLen: 80,
        })
        assert.match(line, /event=feedback_submitted_broadcast/)
        assert.match(line, /session=fb-test/)
        assert.match(line, /trace=trace-abc/)
        assert.match(line, /feedback_len=80/)
    })

    it('formats feedback_undelivered broadcast line', () => {
        const line = feedbackUndeliveredBroadcastLogLine({
            sessionId: 'fb-test',
            traceId: 'trace-abc',
            feedbackLen: 12,
            detail: 'mcp_link_lost',
        })
        assert.match(line, /event=feedback_undelivered_broadcast/)
        assert.match(line, /detail=mcp_link_lost/)
    })

    it('covers all panel_submit_no_effect reason tokens', () => {
        const reasons = [
            'session_not_on_hub_queue',
            'no_pending_session',
            'stale_session_fallback',
            'project_mismatch',
            'mcp_detached',
            'mcp_ws_not_open',
            'mcp_gone_after_resolve',
            'transport_queued',
        ]
        for (const reason of reasons) {
            const line = panelSubmitNoEffectLogLine({
                reason,
                sessionId: 'fb-matrix',
                feedbackLen: 1,
            })
            assert.match(line, new RegExp(`reason=${reason}`))
        }
    })
})
