"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHubSnapshot = buildHubSnapshot;
function buildHubSnapshot(input) {
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
//# sourceMappingURL=hubSnapshot.js.map