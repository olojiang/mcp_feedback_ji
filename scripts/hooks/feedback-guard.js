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

/** Skip forced rules-refresh checkpoint while user has not replied to an open feedback wait. */
function shouldSkipRulesRefresh(activeWait) {
  return !!(activeWait && activeWait.active && !activeWait.detached)
}

module.exports = {
  isInteractiveFeedbackTool,
  buildFollowupMessage,
  shouldSkipRulesRefresh,
}
