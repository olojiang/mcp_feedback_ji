import { WebSocket } from 'ws';
import { formatLogEvent } from '../structuredLog.js';
import { formatDisconnectEvent } from '../disconnectReason.js';

export type ClientType = 'webview' | 'mcp-server' | 'unknown';

export type WebviewTransport = 'bridge' | 'tcp';

export interface ConnectedClient {
    ws: WebSocket;
    clientType: ClientType;
    lastPong: number;
    webviewTransport?: WebviewTransport;
}

export class ClientRegistry {
    private readonly clients = new Map<WebSocket, ConnectedClient>();

    add(ws: WebSocket): ConnectedClient {
        const client: ConnectedClient = {
            ws,
            clientType: 'unknown',
            lastPong: Date.now(),
        };
        this.clients.set(ws, client);
        return client;
    }

    remove(ws: WebSocket): void {
        this.clients.delete(ws);
    }

    setClientType(ws: WebSocket, clientType: Exclude<ClientType, 'unknown'>): void {
        const c = this.clients.get(ws);
        if (c) c.clientType = clientType;
    }

    counts(): { webviews: number; mcpServers: number } {
        let webviews = 0;
        let mcpServers = 0;
        for (const [, c] of this.clients) {
            if (c.clientType === 'webview') webviews++;
            else if (c.clientType === 'mcp-server') mcpServers++;
        }
        return { webviews, mcpServers };
    }

    transportCounts(): { bridgeWebviews: number; tcpWebviews: number; mcpServers: number } {
        let bridgeWebviews = 0;
        let tcpWebviews = 0;
        let mcpServers = 0;
        for (const [, c] of this.clients) {
            if (c.clientType === 'webview') {
                if (c.webviewTransport === 'bridge') bridgeWebviews++;
                else tcpWebviews++;
            } else if (c.clientType === 'mcp-server') {
                mcpServers++;
            }
        }
        return { bridgeWebviews, tcpWebviews, mcpServers };
    }

    closeAll(): void {
        for (const [, client] of this.clients) {
            try { client.ws.close(); } catch { /* ignore */ }
        }
        this.clients.clear();
    }

    forEachWebview(cb: (ws: WebSocket) => void): void {
        for (const [ws, client] of this.clients) {
            if (client.clientType === 'webview') cb(ws);
        }
    }

    setLastPong(ws: WebSocket, ts: number): void {
        const c = this.clients.get(ws);
        if (c) c.lastPong = ts;
    }

    sweepStale(now: number, timeoutMs: number, onStale: (ws: WebSocket) => void): void {
        for (const [ws, client] of this.clients) {
            if (client.clientType === 'mcp-server') {
                if (now - client.lastPong > timeoutMs) {
                    console.log(formatLogEvent('MCP Feedback Hub', 'stale_sweep', {
                        action: 'skip',
                        client_type: 'mcp-server',
                        idle_ms: now - client.lastPong,
                    }));
                }
                continue;
            }
            if (now - client.lastPong > timeoutMs) {
                try { ws.close(); } catch { /* ignore */ }
                this.clients.delete(ws);
                console.log(formatLogEvent('MCP Feedback Hub', 'stale_sweep', {
                    action: 'close',
                    client_type: client.clientType,
                    idle_ms: now - client.lastPong,
                    detail: formatDisconnectEvent('hub_sweep'),
                }));
                onStale(ws);
                continue;
            }
            try { ws.ping(); } catch { /* ignore */ }
        }
    }
}
