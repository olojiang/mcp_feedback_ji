"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchRouteMessage = dispatchRouteMessage;
const messageRouter_1 = require("./messageRouter");
function dispatchRouteMessage(ws, client, msg, handlers) {
    (0, messageRouter_1.routeHubMessage)(ws, client, msg, {
        onRegister: handlers.onRegister,
        onFeedbackRequest: handlers.onFeedbackRequest,
        onFeedbackResponse: handlers.onFeedbackResponse,
        onQueuePending: handlers.onQueuePending,
        onDismiss: handlers.onDismiss,
        onGetState: handlers.onGetState,
        onSessionDisplayed: handlers.onSessionDisplayed,
        onClipboardWrite: handlers.onClipboardWrite,
        onClipboardPaste: handlers.onClipboardPaste,
        sendPong: handlers.sendPong,
        onProtocolError: handlers.onProtocolError,
    });
}
//# sourceMappingURL=routeAdapter.js.map