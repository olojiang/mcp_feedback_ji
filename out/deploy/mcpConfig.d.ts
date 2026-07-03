export interface McpServerEntry {
    command: string;
    args: string[];
    env: {
        MCP_FEEDBACK_VERSION: string;
    };
}
export interface McpConfigPlan {
    changed: boolean;
    entry: McpServerEntry;
    removeLegacy: string[];
}
/** Pure plan for ~/.cursor/mcp.json mcp-feedback-enhanced entry. */
export declare function planMcpConfigUpdate(extensionPath: string, version: string, nodeBin: string, existing?: Record<string, unknown>): McpConfigPlan;
export declare function applyMcpConfigPlan(config: Record<string, unknown>, plan: McpConfigPlan): Record<string, unknown>;
