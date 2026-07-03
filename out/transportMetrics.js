"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTransportMetrics = buildTransportMetrics;
function buildTransportMetrics(counts) {
    const bridge = counts.bridgeWebviews;
    const tcp = counts.tcpWebviews;
    const total = bridge + tcp;
    const bridgeRatio = total > 0 ? bridge / total : 0;
    let primary = 'none';
    if (bridge > 0 && tcp === 0)
        primary = 'bridge';
    else if (tcp > 0 && bridge === 0)
        primary = 'tcp';
    else if (total > 0)
        primary = 'mixed';
    return {
        bridge_webviews: bridge,
        tcp_webviews: tcp,
        mcp_servers: counts.mcpServers,
        bridge_ratio: Math.round(bridgeRatio * 1000) / 1000,
        primary_transport: primary,
    };
}
//# sourceMappingURL=transportMetrics.js.map