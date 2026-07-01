"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeWsMessage = decodeWsMessage;
function rawDataToText(raw) {
    if (typeof raw === 'string')
        return raw;
    if (Array.isArray(raw))
        return Buffer.concat(raw).toString('utf-8');
    if (raw instanceof ArrayBuffer)
        return Buffer.from(raw).toString('utf-8');
    return raw.toString('utf-8');
}
function decodeWsMessage(raw) {
    const payload = rawDataToText(raw);
    return JSON.parse(payload);
}
//# sourceMappingURL=wsMessageCodec.js.map