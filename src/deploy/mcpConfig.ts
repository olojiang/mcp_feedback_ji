import * as path from 'node:path';

export interface McpServerEntry {
    command: string;
    args: string[];
    env: {
        MCP_FEEDBACK_VERSION: string;
        MCP_FEEDBACK_CURSOR_KEEPALIVE_MS?: string;
        MCP_FEEDBACK_CURSOR_PROGRESS_MS?: string;
    };
}

export interface McpConfigPlan {
    changed: boolean;
    entry: McpServerEntry;
    removeLegacy: string[];
}

/** Pure plan for ~/.cursor/mcp.json mcp-feedback-enhanced entry. */
export function planMcpConfigUpdate(
    extensionPath: string,
    version: string,
    nodeBin: string,
    existing?: Record<string, unknown>,
): McpConfigPlan {
    const localServerPath = path.join(extensionPath, 'mcp-server', 'dist', 'index.js');
    const entry: McpServerEntry = {
        command: nodeBin,
        args: [localServerPath],
        env: {
            MCP_FEEDBACK_VERSION: version,
            MCP_FEEDBACK_CURSOR_KEEPALIVE_MS: '0',
            MCP_FEEDBACK_CURSOR_PROGRESS_MS: '25000',
        },
    };
    const existingEnv = (existing?.env || {}) as Record<string, string>;
    const unchanged = existing?.command === entry.command
        && JSON.stringify(existing?.args) === JSON.stringify(entry.args)
        && existingEnv.MCP_FEEDBACK_VERSION === version
        && existingEnv.MCP_FEEDBACK_CURSOR_KEEPALIVE_MS === entry.env.MCP_FEEDBACK_CURSOR_KEEPALIVE_MS
        && existingEnv.MCP_FEEDBACK_CURSOR_PROGRESS_MS === entry.env.MCP_FEEDBACK_CURSOR_PROGRESS_MS;
    return {
        changed: !unchanged,
        entry,
        removeLegacy: ['mcp-feedback-v2'],
    };
}

export function applyMcpConfigPlan(
    config: Record<string, unknown>,
    plan: McpConfigPlan,
): Record<string, unknown> {
    const mcpServers = { ...(config.mcpServers as Record<string, unknown> || {}) };
    for (const legacy of plan.removeLegacy) {
        delete mcpServers[legacy];
    }
    mcpServers['mcp-feedback-enhanced'] = plan.entry;
    return { ...config, mcpServers };
}
