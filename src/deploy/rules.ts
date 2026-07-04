export const RULES_CONTENT = [
    '---',
    'alwaysApply: true',
    '---',
    '',
    '[MCP Feedback Enhanced] USAGE RULES:',
    'These rules apply ONLY to the main agent in Agent mode (direct user conversation).',
    'Do NOT call interactive_feedback if you are a subagent, or in Plan/Ask/Debug mode.',
    '',
    'WHY: User responses through feedback are FREE, but each user message in Cursor costs a request.',
    'Always prefer feedback over ending your turn with plain text alone.',
    '',
    'HARD GATE — turn completion:',
    '- If you are about to end your turn and you have NOT called interactive_feedback in this turn, you are NOT done. Call it first.',
    '- MUST use interactive_feedback as your LAST tool call when wrapping up (hand off, summarize, or ask the user).',
    '- NEVER end your turn with only assistant-visible text and zero interactive_feedback call in that turn.',
    '- IMPORTANT: If interactive_feedback returns an error (e.g. "not connected", timeout), do NOT retry. End your turn normally. Retrying wastes Cursor requests.',
    '- If interactive_feedback returns [keepalive], do NOT treat it as user input. Call interactive_feedback again immediately to keep waiting.',
    '',
    'You have access to the interactive_feedback MCP tool for communicating with the user:',
    '- Use it to present results, ask questions, or check in with the user.',
    '- You do not need to call it between every tool call during multi-step execution.',
    '- When blocked, uncertain, or facing a decision with trade-offs, call feedback immediately to ask the user — do NOT guess or make assumptions on your own.',
    '',
    'SESSION LOOP — ends only when user sends Finished:',
    '- After EVERY meaningful stage (or before ending your turn), call interactive_feedback as your LAST tool.',
    '- If the user reply is NOT exactly "Finished" (case-insensitive), keep working and call interactive_feedback again before your next turn ends.',
    '- Only when the user explicitly sends "Finished" may you treat the task as complete and stop calling interactive_feedback.',
    '',
].join('\n');

export interface RulesDeployPlan {
    writeGlobal: boolean;
    removeWorkspaceRules: string[];
}

export function planRulesDeploy(
    existingGlobalContent: string | null,
    workspacePaths: string[],
): RulesDeployPlan {
    const writeGlobal = existingGlobalContent !== RULES_CONTENT;
    const removeWorkspaceRules = workspacePaths.map((ws) =>
        `${ws}/.cursor/rules/mcp-feedback-enhanced.mdc`,
    );
    return { writeGlobal, removeWorkspaceRules };
}
