"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientRegistry = void 0;
const structuredLog_js_1 = require("../structuredLog.js");
const disconnectReason_js_1 = require("../disconnectReason.js");
const extensionFileLog_js_1 = require("../extensionFileLog.js");
class ClientRegistry {
    constructor() {
        this.clients = new Map();
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
        if (c)
            c.lastPong = ts;
    }
    sweepStale(now, timeoutMs, onStale) {
        for (const [ws, client] of this.clients) {
            if (client.clientType === 'mcp-server') {
                if (now - client.lastPong > timeoutMs) {
                    (0, extensionFileLog_js_1.hubLog)((0, structuredLog_js_1.formatLogEvent)('MCP Feedback Hub', 'stale_sweep', {
                        action: 'skip',
                        client_type: 'mcp-server',
                        idle_ms: now - client.lastPong,
                    }));
                }
                continue;
            }
            if (now - client.lastPong > timeoutMs) {
                try {
                    ws.close();
                }
                catch { /* ignore */ }
                this.clients.delete(ws);
                (0, extensionFileLog_js_1.hubLog)((0, structuredLog_js_1.formatLogEvent)('MCP Feedback Hub', 'stale_sweep', {
                    action: 'close',
                    client_type: client.clientType,
                    idle_ms: now - client.lastPong,
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