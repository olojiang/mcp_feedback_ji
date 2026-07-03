export type FeedbackLogTarget = 'extension' | 'mcp-server' | 'webview';
export declare function feedbackLogDir(): string;
export declare function resolveFeedbackLogPath(target: FeedbackLogTarget): string;
/** Human-readable agent link status for the panel status bar. */
export declare function formatAgentLinkStatus(mcpServers: number, pendingCount: number, mcpDetached: number): string;
