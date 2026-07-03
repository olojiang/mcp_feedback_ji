export interface TransportCounts {
    bridgeWebviews: number;
    tcpWebviews: number;
    mcpServers: number;
}
export declare function buildTransportMetrics(counts: TransportCounts): {
    bridge_webviews: number;
    tcp_webviews: number;
    mcp_servers: number;
    bridge_ratio: number;
    primary_transport: 'bridge' | 'tcp' | 'mixed' | 'none';
};
