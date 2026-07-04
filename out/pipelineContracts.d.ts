/** Agent → MCP → Hub → UI pipeline hop identifiers (for logs and tests). */
export type HubClientType = 'webview' | 'mcp-server' | 'unknown';
export declare const PipelineHop: {
    readonly MCP_REQUEST: "mcp→hub:feedback_request";
    readonly HUB_ENQUEUE: "hub:enqueue";
    readonly HUB_BROADCAST: "hub→ui:session_updated";
    readonly UI_RESPONSE: "ui→hub:feedback_response";
    readonly MCP_RESULT: "hub→mcp:feedback_result";
    readonly SESSION_BOUND: "hub→mcp:session_bound";
    readonly UI_DISPLAYED: "ui→hub:session_displayed";
};
export type PipelineHopId = (typeof PipelineHop)[keyof typeof PipelineHop];
/** MCP may send feedback_request before register ack; webview must never send it. */
export declare function canSendFeedbackRequest(clientType: HubClientType): boolean;
/** Only the panel webview may resolve a pending feedback session. */
export declare function canSendFeedbackResponse(clientType: HubClientType): boolean;
export declare function pipelineRejectReason(hop: PipelineHopId, clientType: HubClientType): string | null;
export declare function pipelineTraceLine(hop: PipelineHopId, detail: string): string;
