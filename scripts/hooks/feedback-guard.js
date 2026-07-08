'use strict'

function isInteractiveFeedbackTool(toolName) {
  if (!toolName) return false
  const lower = String(toolName).toLowerCase()
  return lower.includes('interactive_feedback')
}

/** Zero-cost hook injection — does not consume a Cursor Request like permission: deny. */
function buildFollowupMessage(agentMessage) {
  return { followup_message: String(agentMessage || '') }
}

function buildDuplicateActiveWaitDeny(activeWait) {
  const sessionId = activeWait && activeWait.sessionId ? String(activeWait.sessionId) : 'current feedback session'
  const message = 'A feedback panel is already waiting for this Cursor trace (' + sessionId + '). '
    + 'Do not call interactive_feedback again; end this turn and wait for the existing panel reply.'
  return {
    permission: 'deny',
    user_message: message,
    agent_message: message,
  }
}

/** Skip forced rules-refresh checkpoint while user has not replied to an open feedback wait. */
function shouldSkipRulesRefresh(activeWait) {
  return !!(activeWait && activeWait.active && !activeWait.detached)
}

module.exports = {
  isInteractiveFeedbackTool,
  buildFollowupMessage,
  buildDuplicateActiveWaitDeny,
  shouldSkipRulesRefresh,
}
