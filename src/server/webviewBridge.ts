import { WebSocket } from 'ws';

export type WebviewOutbound = (data: Record<string, unknown>) => void;

export interface WebviewBridge {
    socket: WebSocket;
    deliver: (raw: string) => void;
    dispose: () => void;
    isAlive: () => boolean;
}

export function createWebviewBridge(postToPanel: WebviewOutbound): WebviewBridge {
    const listeners = new Map<string, Array<(arg: unknown) => void>>();
    let readyState: number = WebSocket.OPEN;

    const emit = (event: string, arg?: unknown) => {
        for (const fn of listeners.get(event) || []) fn(arg);
    };

    const socket = {
        get readyState() {
            return readyState;
        },
        send(data: string | Buffer) {
            if (readyState !== WebSocket.OPEN) return;
            try {
                postToPanel(JSON.parse(data.toString()));
            } catch {
                // ignore malformed outbound
            }
        },
        close() {
            if (readyState === WebSocket.CLOSED) return;
            readyState = WebSocket.CLOSED;
            emit('close');
        },
        on(event: string, fn: (arg: unknown) => void) {
            const list = listeners.get(event) || [];
            list.push(fn);
            listeners.set(event, list);
            return socket;
        },
        ping() {
            // bridge does not need TCP ping
        },
    } as unknown as WebSocket;

    return {
        socket,
        deliver(raw: string) {
            emit('message', raw);
        },
        dispose() {
            socket.close();
            listeners.clear();
        },
        isAlive() {
            return readyState === WebSocket.OPEN;
        },
    };
}
