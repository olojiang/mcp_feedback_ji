import { WebSocket } from 'ws';
export type ClientType = 'webview' | 'mcp-server' | 'unknown';
export type WebviewTransport = 'bridge' | 'tcp';
export interface ConnectedClient {
    ws: WebSocket;
    clientType: ClientType;
    lastPong: number;
    webviewTransport?: WebviewTransport;
}
export declare class ClientRegistry {
    private readonly clients;
    add(ws: WebSocket): ConnectedClient;
    remove(ws: WebSocket): void;
    setClientType(ws: WebSocket, clientType: Exclude<ClientType, 'unknown'>): void;
    counts(): {
        webviews: number;
        mcpServers: number;
    };
    transportCounts(): {
        bridgeWebviews: number;
        tcpWebviews: number;
        mcpServers: number;
    };
    closeAll(): void;
    forEachWebview(cb: (ws: WebSocket) => void): void;
    setLastPong(ws: WebSocket, ts: number): void;
    sweepStale(now: number, timeoutMs: number, onStale: (ws: WebSocket) => void): void;
}
