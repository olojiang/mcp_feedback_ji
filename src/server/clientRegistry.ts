import { WebSocket } from 'ws';
import { formatLogEvent } from '../structuredLog.js';
import { formatDisconnectEvent } from '../disconnectReason.js';
import { hubLog } from '../extensionFileLog.js';

export type ClientType = 'webview' | 'mcp-server' | 'unknown';

export type WebviewTransport = 'bridge' | 'tcp';

export interface ConnectedClient {
    ws: WebSocket;
    clientType: ClientType;
    lastPong: number;
    webviewTransport?: WebviewTransport;
}

export interface StaleSweepOptions {
    /** MCP WS with live pending feedback — skip normal idle close. */
    protectedMcpWs?: ReadonlySet<WebSocket>;
    /** Force-close MCP idle longer than this even when protected (zombie wait). */
    mcpZombieMs?: number;
    /** Rate-limit repeated protected active-wait skip logs per MCP socket. */
    protectedSkipLogMs?: number;
}

export class ClientRegistry {
    private readonly clients = new Map<WebSocket, ConnectedClient>();
    private readonly protectedSkipLoggedAt = new WeakMap<WebSocket, number>();

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
        if (c) {
            c.lastPong = ts;
            this.protectedSkipLoggedAt.delete(ws);
        }
    }

    sweepStale(
        now: number,
        timeoutMs: number,
        onStale: (ws: WebSocket) => void,
        opts: StaleSweepOptions = {},
    ): void {
        const protectedMcp = opts.protectedMcpWs;
        const mcpZombieMs = opts.mcpZombieMs ?? 35 * 60 * 1000;
        const protectedSkipLogMs = opts.protectedSkipLogMs ?? 5 * 60 * 1000;

        for (const [ws, client] of this.clients) {
            const idleMs = now - client.lastPong;

            if (client.clientType === 'mcp-server') {
                if (idleMs <= timeoutMs) {
                    try { ws.ping(); } catch { /* ignore */ }
                    continue;
                }
                const protectedWait = protectedMcp?.has(ws) === true;
                if (protectedWait && idleMs < mcpZombieMs) {
                    const lastLoggedAt = this.protectedSkipLoggedAt.get(ws);
                    if (lastLoggedAt === undefined || now - lastLoggedAt >= protectedSkipLogMs) {
                        this.protectedSkipLoggedAt.set(ws, now);
                        hubLog(formatLogEvent('MCP Feedback Hub', 'stale_sweep', {
                            action: 'skip',
                            client_type: 'mcp-server',
                            idle_ms: idleMs,
                            protected: true,
                            zombie_ms: mcpZombieMs,
                            time_to_zombie_ms: Math.max(0, mcpZombieMs - idleMs),
                            detail: 'active_wait',
                        }));
                    }
                    try { ws.ping(); } catch { /* ignore */ }
                    continue;
                }
                try { ws.close(); } catch { /* ignore */ }
                this.clients.delete(ws);
                this.protectedSkipLoggedAt.delete(ws);
                hubLog(formatLogEvent('MCP Feedback Hub', 'stale_sweep', {
                    action: 'close',
                    client_type: 'mcp-server',
                    idle_ms: idleMs,
                    protected: protectedWait,
                    zombie_ms: protectedWait ? mcpZombieMs : undefined,
                    detail: protectedWait ? 'zombie_wait' : formatDisconnectEvent('hub_sweep'),
                }));
                onStale(ws);
                continue;
            }

            if (client.webviewTransport === 'bridge') {
                continue;
            }
            if (idleMs > timeoutMs) {
                try { ws.close(); } catch { /* ignore */ }
                this.clients.delete(ws);
                hubLog(formatLogEvent('MCP Feedback Hub', 'stale_sweep', {
                    action: 'close',
                    client_type: client.clientType,
                    idle_ms: idleMs,
                    detail: formatDisconnectEvent('hub_sweep'),
                }));
                onStale(ws);
                continue;
            }
            try { ws.ping(); } catch { /* ignore */ }
        }
    }
}
