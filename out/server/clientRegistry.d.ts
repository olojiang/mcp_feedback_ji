import { WebSocket } from 'ws';
export type ClientType = 'webview' | 'mcp-server' | 'unknown';
export interface ConnectedClient {
    ws: WebSocket;
    clientType: ClientType;
    lastPong: number;
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
    closeAll(): void;
    forEachWebview(cb: (ws: WebSocket) => void): void;
    sweepStale(now: number, timeoutMs: number, onStale: (ws: WebSocket) => void): void;
}
