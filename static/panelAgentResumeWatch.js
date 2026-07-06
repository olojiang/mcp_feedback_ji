'use strict'

var AGENT_RESUME_STALL_MS = 30000

var AGENT_RESUME_STALL_TOAST =
    'Reply delivered. If Cursor still spins: Stop the turn, then send a new chat message.'

function agentResumeStallLogLine(sessionId, waitingCount) {
    return 'event=agent_resume_stall session=' + (sessionId || '-')
        + ' waiting_count=' + (typeof waitingCount === 'number' ? waitingCount : 0)
}

function scheduleAgentResumeWatch(clearFn, setTimeoutFn, delayMs, onFire) {
    if (typeof clearFn === 'function') clearFn()
    return setTimeoutFn(onFire, delayMs)
}

(function (exports) {
    exports.AGENT_RESUME_STALL_MS = AGENT_RESUME_STALL_MS
    exports.AGENT_RESUME_STALL_TOAST = AGENT_RESUME_STALL_TOAST
    exports.agentResumeStallLogLine = agentResumeStallLogLine
    exports.scheduleAgentResumeWatch = scheduleAgentResumeWatch
})(typeof window !== 'undefined'
    ? (window.PanelAgentResumeWatchModule = {})
    : (typeof module !== 'undefined' ? module.exports : {}))
