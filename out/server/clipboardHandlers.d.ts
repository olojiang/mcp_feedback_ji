import type { WebSocket } from 'ws';
import type { ClipboardPort } from '../clipboardPort.js';
export interface ClipboardHandlerDeps {
    clipboard: ClipboardPort;
    readImageBase64: () => Promise<string | null>;
    log: (msg: string) => void;
    send: (ws: WebSocket, data: Record<string, unknown>) => void;
}
export declare function createClipboardHandlers(deps: ClipboardHandlerDeps): {
    onClipboardWrite: (targetWs: WebSocket, msg: {
        text?: string;
    }) => void;
    onClipboardPaste: (targetWs: WebSocket, msg: {
        request_id?: string;
    }) => Promise<void>;
};
