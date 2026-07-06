export interface BroadcastDeliveryResult {
    delivered: boolean;
    webviewCount: number;
    warn?: string;
}
/** Returns whether any webview client received the broadcast. */
export declare function evaluateBroadcastDelivery(webviewCount: number): BroadcastDeliveryResult;
export declare function sessionUpdatedLogLine(sessionId: string, delivery: BroadcastDeliveryResult, projectDirectory?: string, traceId?: string): string;
export declare function sessionReplayLogLine(sessionId: string, target: string, projectDirectory?: string, traceId?: string): string;
export declare function sessionDisplayedLogLine(sessionId: string, projectDirectory?: string, traceId?: string): string;
export declare function feedbackRequestAcceptedLogLine(sessionId: string, projectDirectory?: string, traceId?: string): string;
export declare function feedbackResponseLogLine(sessionId: string, projectDirectory: string | undefined, feedback: string, traceId?: string, imageCount?: number): string;
export interface UiSyncMismatchInput {
    serverPendingCount: number;
    localWaitingCount: number;
    bridgeReady: boolean;
}
/** Panel shows no waiting tabs but server still has pending feedback. */
export declare function detectUiSyncMismatch(input: UiSyncMismatchInput): string | null;
