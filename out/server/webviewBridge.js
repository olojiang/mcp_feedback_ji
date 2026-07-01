"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebviewBridge = createWebviewBridge;
const ws_1 = require("ws");
function createWebviewBridge(postToPanel) {
    const listeners = new Map();
    let readyState = ws_1.WebSocket.OPEN;
    const emit = (event, arg) => {
        for (const fn of listeners.get(event) || [])
            fn(arg);
    };
    const socket = {
        get readyState() {
            return readyState;
        },
        send(data) {
            if (readyState !== ws_1.WebSocket.OPEN)
                return;
            try {
                postToPanel(JSON.parse(data.toString()));
            }
            catch {
                // ignore malformed outbound
            }
        },
        close() {
            if (readyState === ws_1.WebSocket.CLOSED)
                return;
            readyState = ws_1.WebSocket.CLOSED;
            emit('close');
        },
        on(event, fn) {
            const list = listeners.get(event) || [];
            list.push(fn);
            listeners.set(event, list);
            return socket;
        },
        ping() {
            // bridge does not need TCP ping
        },
    };
    return {
        socket,
        deliver(raw) {
            emit('message', raw);
        },
        dispose() {
            socket.close();
            listeners.clear();
        },
    };
}
//# sourceMappingURL=webviewBridge.js.map