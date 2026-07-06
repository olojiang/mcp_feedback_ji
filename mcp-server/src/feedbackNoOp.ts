/** Tool responses that complete interactive_feedback without user input — must not trigger agent work. */

export type FeedbackNoOpReason = 'keepalive' | 'released_duplicate' | 'superseded';

export function requestWasteGuardLogLine(reason: FeedbackNoOpReason, traceId?: string): string {
    return [
        'event=request_waste_guard',
        `reason=${reason}`,
        `trace=${traceId || '-'}`,
        'action=end_turn_no_retry',
    ].join(' ');
}

export function feedbackNoOpToolText(reason: FeedbackNoOpReason): string {
    const base = 'Do NOT treat this as user input. End your turn immediately. '
        + 'Do NOT call interactive_feedback again or take any further action. '
        + 'The panel session stays open; reply there when ready.';
    if (reason === 'keepalive') {
        return '[keepalive] Auto-released before Cursor tool timeout (no user reply yet). ' + base;
    }
    if (reason === 'released_duplicate') {
        return '[released_duplicate] A newer interactive_feedback call took over this wait. ' + base;
    }
    return '[superseded] Duplicate interactive_feedback while another call is active. ' + base;
}
