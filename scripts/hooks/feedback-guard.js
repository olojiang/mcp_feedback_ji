'use strict'

function isInteractiveFeedbackTool(toolName) {
  if (!toolName) return false
  const lower = String(toolName).toLowerCase()
  return lower.includes('interactive_feedback')
}

function buildDuplicateFeedbackDeny() {
  return {
    permission: 'deny',
    user_message: 'Feedback already waiting',
    agent_message:
      'interactive_feedback is already waiting for the user on this chat trace. '
      + 'Do NOT call interactive_feedback again. End your turn immediately and wait for panel reply.',
  }
}

/** Skip forced rules-refresh checkpoint while user has not replied to an open feedback wait. */
function shouldSkipRulesRefresh(activeWait) {
  return !!(activeWait && activeWait.active && !activeWait.detached)
}

module.exports = {
  isInteractiveFeedbackTool,
  buildDuplicateFeedbackDeny,
  shouldSkipRulesRefresh,
}
