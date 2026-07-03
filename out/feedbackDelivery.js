"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateBroadcastDelivery = evaluateBroadcastDelivery;
exports.sessionUpdatedLogLine = sessionUpdatedLogLine;
exports.sessionReplayLogLine = sessionReplayLogLine;
exports.sessionDisplayedLogLine = sessionDisplayedLogLine;
exports.feedbackRequestAcceptedLogLine = feedbackRequestAcceptedLogLine;
exports.feedbackResponseLogLine = feedbackResponseLogLine;
exports.detectUiSyncMismatch = detectUiSyncMismatch;
/** Returns whether any webview client received the broadcast. */
function evaluateBroadcastDelivery(webviewCount) {
    if (webviewCount <= 0) {
        return {
            delivered: false,
            webviewCount: 0,
            warn: 'no_webview_connected',
        };
    }
    return { delivered: true, webviewCount };
}
function sessionUpdatedLogLine(sessionId, delivery, projectDirectory) {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    if (delivery.delivered) {
        return `sessionUpdated: delivered session=${sessionId}${project} webviews=${delivery.webviewCount}`;
    }
    return `sessionUpdated: UNDELIVERED session=${sessionId}${project} reason=${delivery.warn ?? 'unknown'}`;
}
function sessionReplayLogLine(sessionId, target, projectDirectory) {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    return `sessionReplay: session=${sessionId}${project} target=${target}`;
}
function sessionDisplayedLogLine(sessionId, projectDirectory) {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    return `sessionDisplayed: ack session=${sessionId}${project}`;
}
function feedbackRequestAcceptedLogLine(sessionId, projectDirectory) {
    return `feedbackRequest: accepted session=${sessionId} project=${projectDirectory ?? '(none)'}`;
}
function feedbackResponseLogLine(sessionId, projectDirectory, feedbackPreview) {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    return `feedbackResponse: session=${sessionId}${project} feedback=${feedbackPreview}`;
}
/** Panel shows no waiting tabs but server still has pending feedback. */
function detectUiSyncMismatch(input) {
    if (!input.bridgeReady)
        return null;
    if (input.serverPendingCount <= 0)
        return null;
    if (input.localWaitingCount >= input.serverPendingCount)
        return null;
    return `UI missing ${input.serverPendingCount - input.localWaitingCount} waiting tab(s) — server has pending feedback`;
}
//# sourceMappingURL=feedbackDelivery.js.map