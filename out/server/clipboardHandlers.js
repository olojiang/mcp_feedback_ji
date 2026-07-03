"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClipboardHandlers = createClipboardHandlers;
function createClipboardHandlers(deps) {
    return {
        onClipboardWrite: (targetWs, msg) => {
            const text = msg.text || '';
            void Promise.resolve(deps.clipboard.writeText(text))
                .then(() => {
                deps.log(`clipboard-write ok len=${text.length}`);
                deps.send(targetWs, { type: 'clipboard_write_ok', length: text.length });
            })
                .catch((err) => {
                deps.log(`clipboard-write err ${err}`);
                deps.send(targetWs, { type: 'clipboard_write_err', error: String(err) });
            });
        },
        onClipboardPaste: async (targetWs, msg) => {
            const image = await deps.readImageBase64();
            let text = '';
            if (!image) {
                try {
                    text = await deps.clipboard.readText();
                }
                catch { /* ignore */ }
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
//# sourceMappingURL=clipboardHandlers.js.map