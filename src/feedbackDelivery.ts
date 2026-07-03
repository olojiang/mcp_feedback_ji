import { traceLogSuffix } from './traceContext';

export interface BroadcastDeliveryResult {
    delivered: boolean;
    webviewCount: number;
    warn?: string;
}

/** Returns whether any webview client received the broadcast. */
export function evaluateBroadcastDelivery(webviewCount: number): BroadcastDeliveryResult {
    if (webviewCount <= 0) {
        return {
            delivered: false,
            webviewCount: 0,
            warn: 'no_webview_connected',
        };
    }
    return { delivered: true, webviewCount };
}

export function sessionUpdatedLogLine(
    sessionId: string,
    delivery: BroadcastDeliveryResult,
    projectDirectory?: string,
    traceId?: string,
): string {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    const trace = traceLogSuffix(traceId);
    if (delivery.delivered) {
        return `sessionUpdated: delivered session=${sessionId}${project}${trace} webviews=${delivery.webviewCount}`;
    }
    return `sessionUpdated: UNDELIVERED session=${sessionId}${project}${trace} reason=${delivery.warn ?? 'unknown'}`;
}

export function sessionReplayLogLine(
    sessionId: string,
    target: string,
    projectDirectory?: string,
    traceId?: string,
): string {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    return `sessionReplay: session=${sessionId}${project}${traceLogSuffix(traceId)} target=${target}`;
}

export function sessionDisplayedLogLine(
    sessionId: string,
    projectDirectory?: string,
    traceId?: string,
): string {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    return `sessionDisplayed: ack session=${sessionId}${project}${traceLogSuffix(traceId)}`;
}

export function feedbackRequestAcceptedLogLine(
    sessionId: string,
    projectDirectory?: string,
    traceId?: string,
): string {
    return `feedbackRequest: accepted session=${sessionId} project=${projectDirectory ?? '(none)'}${traceLogSuffix(traceId)}`;
}

export function feedbackResponseLogLine(
    sessionId: string,
    projectDirectory: string | undefined,
    feedbackPreview: string,
    traceId?: string,
): string {
    const project = projectDirectory ? ` project=${projectDirectory}` : '';
    return `feedbackResponse: session=${sessionId}${project}${traceLogSuffix(traceId)} feedback=${feedbackPreview}`;
}

export interface UiSyncMismatchInput {
    serverPendingCount: number;
    localWaitingCount: number;
    bridgeReady: boolean;
}

/** Panel shows no waiting tabs but server still has pending feedback. */
export function detectUiSyncMismatch(input: UiSyncMismatchInput): string | null {
    if (!input.bridgeReady) return null;
    if (input.serverPendingCount <= 0) return null;
    if (input.localWaitingCount >= input.serverPendingCount) return null;
    return `UI missing ${input.serverPendingCount - input.localWaitingCount} waiting tab(s) — server has pending feedback`;
}
