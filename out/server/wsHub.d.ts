/**
 * WebSocket hub: the central message router.
 *
 * Feedback sessions are keyed by conversation_id (from Cursor),
 * with fallback to project hash or auto-generated key.
 * Sessions survive transport disconnection for reconnection.
 */
import { type WebviewBridge } from './webviewBridge';
export declare class WsHub {
    private server;
    private wss;
    private port;
    private readonly version;
    private readonly clients;
    private heartbeatTimer;
    private readonly feedback;
    private readonly pending;
    private readonly timeline;
    private readonly feedbackFlow;
    private workspaces;
    constructor(version?: string);
    setWorkspaces(workspaces: string[]): void;
    onFeedbackRequest(cb: () => void): void;
    onFeedbackResolved(cb: () => void): void;
    onFeedbackError(cb: (reason: string) => void): void;
    getPort(): number;
    getConnectedClients(): {
        webviews: number;
        mcpServers: number;
    };
    getDebugInfo(): Record<string, unknown>;
    hasPendingRequests(): boolean;
    refreshServerRegistration(): void;
    /** In-process bridge for Cursor webview (avoids unreliable ws:// from webview sandbox). */
    attachWebview(postToPanel: (msg: Record<string, unknown>) => void): WebviewBridge;
    start(): Promise<number>;
    stop(): Promise<void>;
    private _cleanup;
    private _addMessage;
    private _findPort;
    private _startServer;
    private _handleHttpRequest;
    private _registerServer;
    private _handleConnection;
    private _bindClient;
    private _routeMessage;
    private _handleFeedbackRequest;
    private _handleFeedbackResponse;
    private _handleDismiss;
    private _handleQueuePending;
    private _onPendingDelivered;
    private _sendState;
    private _startHeartbeat;
    private _ensureServerRegistration;
    private _send;
    private _broadcastToWebviews;
}
