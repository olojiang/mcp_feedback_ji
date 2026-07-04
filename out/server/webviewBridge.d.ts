import { WebSocket } from 'ws';
export type WebviewOutbound = (data: Record<string, unknown>) => void;
export interface WebviewBridge {
    socket: WebSocket;
    deliver: (raw: string) => void;
    dispose: () => void;
    isAlive: () => boolean;
}
export declare function createWebviewBridge(postToPanel: WebviewOutbound): WebviewBridge;
