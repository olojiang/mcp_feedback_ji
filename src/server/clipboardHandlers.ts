import type { WebSocket } from 'ws';
import type { ClipboardPort } from '../clipboardPort.js';

export interface ClipboardHandlerDeps {
    clipboard: ClipboardPort;
    readImageBase64: () => Promise<string | null>;
    log: (msg: string) => void;
    send: (ws: WebSocket, data: Record<string, unknown>) => void;
}

export function createClipboardHandlers(deps: ClipboardHandlerDeps) {
    return {
        onClipboardWrite: (targetWs: WebSocket, msg: { text?: string }) => {
            const text = msg.text || '';
            void Promise.resolve(deps.clipboard.writeText(text))
                .then(() => {
                    deps.log(`clipboard-write ok len=${text.length}`);
                    deps.send(targetWs, { type: 'clipboard_write_ok', length: text.length });
                })
                .catch((err: unknown) => {
                    deps.log(`clipboard-write err ${err}`);
                    deps.send(targetWs, { type: 'clipboard_write_err', error: String(err) });
                });
        },
        onClipboardPaste: async (targetWs: WebSocket, msg: { request_id?: string }) => {
            const image = await deps.readImageBase64();
            let text = '';
            if (!image) {
                try {
                    text = await deps.clipboard.readText();
                } catch { /* ignore */ }
            }
            deps.log(`clipboard-paste ok image=${!!image} textLen=${text.length}`);
            deps.send(targetWs, {
                type: 'clipboard_paste_result',
                request_id: msg.request_id,
                text,
                image,
            });
        },
    };
}
