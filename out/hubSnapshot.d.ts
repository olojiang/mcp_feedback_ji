export interface HubSnapshotInput {
    port: number;
    pid: number;
    version: string;
    workspaces: string[];
    webviews: number;
    mcpServers: number;
    pendingCount: number;
    pendingSessions: Array<{
        mcp_detached?: boolean;
    }>;
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
export declare function buildHubSnapshot(input: HubSnapshotInput): HubSnapshot;
