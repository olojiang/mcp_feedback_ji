import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    panelSubmitDeliveredLogLine,
    panelSubmitNoEffectLogLine,
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
})
