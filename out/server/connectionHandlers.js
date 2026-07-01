"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindClientConnectionHandlers = bindClientConnectionHandlers;
function bindClientConnectionHandlers(ws, client, deps) {
    let disconnected = false;
    const handleDisconnect = () => {
        if (disconnected)
            return;
        disconnected = true;
        deps.onDisconnect();
    };
    ws.on('message', (raw) => deps.onParsedMessage(raw));
    ws.on('pong', () => { client.lastPong = Date.now(); });
    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
}
//# sourceMappingURL=connectionHandlers.js.map