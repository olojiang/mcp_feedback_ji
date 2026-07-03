export interface HubSnapshotInput {
    port: number;
    pid: number;
    version: string;
    workspaces: string[];
    webviews: number;
    mcpServers: number;
    pendingCount: number;
    pendingSessions: Array<{ mcp_detached?: boolean }>;
}

export interface HubSnapshot {
    port: number;
    pid: number;
    version: string;
    workspaces: string[];
    webviews: number;
    mcp_servers: number;
    pending_count: number;
    mcp_detached_count: number;
}

export function buildHubSnapshot(input: HubSnapshotInput): HubSnapshot {
    const mcpDetachedCount = input.pendingSessions.filter((s) => s.mcp_detached === true).length;
    return {
        port: input.port,
        pid: input.pid,
        version: input.version,
        workspaces: input.workspaces.slice(),
        webviews: input.webviews,
        mcp_servers: input.mcpServers,
        pending_count: input.pendingCount,
        mcp_detached_count: mcpDetachedCount,
    };
}
