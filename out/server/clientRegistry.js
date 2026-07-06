"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientRegistry = void 0;
const structuredLog_js_1 = require("../structuredLog.js");
const disconnectReason_js_1 = require("../disconnectReason.js");
const extensionFileLog_js_1 = require("../extensionFileLog.js");
class ClientRegistry {
    constructor() {
        this.clients = new Map();
        this.protectedSkipLoggedAt = new WeakMap();
    }
    add(ws) {
        const client = {
            ws,
            clientType: 'unknown',
            lastPong: Date.now(),
        };
        this.clients.set(ws, client);
        return client;
    }
    remove(ws) {
        this.clients.delete(ws);
    }
    setClientType(ws, clientType) {
        const c = this.clients.get(ws);
        if (c)
            c.clientType = clientType;
    }
    counts() {
        let webviews = 0;
        let mcpServers = 0;
        for (const [, c] of this.clients) {
            if (c.clientType === 'webview')
                webviews++;
            else if (c.clientType === 'mcp-server')
                mcpServers++;
        }
        return { webviews, mcpServers };
    }
    transportCounts() {
        let bridgeWebviews = 0;
        let tcpWebviews = 0;
        let mcpServers = 0;
        for (const [, c] of this.clients) {
            if (c.clientType === 'webview') {
                if (c.webviewTransport === 'bridge')
                    bridgeWebviews++;
                else
                    tcpWebviews++;
            }
            else if (c.clientType === 'mcp-server') {
                mcpServers++;
            }
        }
        return { bridgeWebviews, tcpWebviews, mcpServers };
    }
    closeAll() {
        for (const [, client] of this.clients) {
            try {
                client.ws.close();
            }
            catch { /* ignore */ }
        }
        this.clients.clear();
    }
    forEachWebview(cb) {
        for (const [ws, client] of this.clients) {
            if (client.clientType === 'webview')
                cb(ws);
        }
    }
    setLastPong(ws, ts) {
        const c = this.clients.get(ws);
        if (c) {
            c.lastPong = ts;
            this.protectedSkipLoggedAt.delete(ws);
        }
    }
    sweepStale(now, timeoutMs, onStale, opts = {}) {
        const protectedMcp = opts.protectedMcpWs;
        const mcpZombieMs = opts.mcpZombieMs ?? 35 * 60 * 1000;
        const protectedSkipLogMs = opts.protectedSkipLogMs ?? 5 * 60 * 1000;
        for (const [ws, client] of this.clients) {
            const idleMs = now - client.lastPong;
            if (client.clientType === 'mcp-server') {
                if (idleMs <= timeoutMs) {
                    try {
                        ws.ping();
                    }
                    catch { /* ignore */ }
                    continue;
                }
                const protectedWait = protectedMcp?.has(ws) === true;
                if (protectedWait && idleMs < mcpZombieMs) {
                    const lastLoggedAt = this.protectedSkipLoggedAt.get(ws);
                    if (lastLoggedAt === undefined || now - lastLoggedAt >= protectedSkipLogMs) {
                        this.protectedSkipLoggedAt.set(ws, now);
                        (0, extensionFileLog_js_1.hubLog)((0, structuredLog_js_1.formatLogEvent)('MCP Feedback Hub', 'stale_sweep', {
                            action: 'skip',
                            client_type: 'mcp-server',
                            idle_ms: idleMs,
                            protected: true,
                            zombie_ms: mcpZombieMs,
                            time_to_zombie_ms: Math.max(0, mcpZombieMs - idleMs),
                            detail: 'active_wait',
                        }));
                    }
                    try {
                        ws.ping();
                    }
                    catch { /* ignore */ }
                    continue;
                }
                try {
                    ws.close();
                }
                catch { /* ignore */ }
                this.clients.delete(ws);
                this.protectedSkipLoggedAt.delete(ws);
                (0, extensionFileLog_js_1.hubLog)((0, structuredLog_js_1.formatLogEvent)('MCP Feedback Hub', 'stale_sweep', {
                    action: 'close',
                    client_type: 'mcp-server',
                    idle_ms: idleMs,
                    protected: protectedWait,
                    zombie_ms: protectedWait ? mcpZombieMs : undefined,
                    detail: protectedWait ? 'zombie_wait' : (0, disconnectReason_js_1.formatDisconnectEvent)('hub_sweep'),
                }));
                onStale(ws);
                continue;
            }
            if (client.webviewTransport === 'bridge') {
                continue;
            }
            if (idleMs > timeoutMs) {
                try {
                    ws.close();
                }
                catch { /* ignore */ }
                this.clients.delete(ws);
                (0, extensionFileLog_js_1.hubLog)((0, structuredLog_js_1.formatLogEvent)('MCP Feedback Hub', 'stale_sweep', {
                    action: 'close',
                    client_type: client.clientType,
                    idle_ms: idleMs,
                    detail: (0, disconnectReason_js_1.formatDisconnectEvent)('hub_sweep'),
                }));
                onStale(ws);
                continue;
            }
            try {
                ws.ping();
            }
            catch { /* ignore */ }
        }
    }
}
exports.ClientRegistry = ClientRegistry;
//# sourceMappingURL=clientRegistry.js.map