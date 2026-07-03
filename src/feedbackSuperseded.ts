/** MCP receives this when a duplicate interactive_feedback was merged into an existing tab. */
export const DUPLICATE_FEEDBACK_SUPERSEDED_MSG =
    'Duplicate interactive_feedback superseded (same cursor trace). '
    + 'Use the existing panel tab; this MCP call was released to avoid a hung wait.';
