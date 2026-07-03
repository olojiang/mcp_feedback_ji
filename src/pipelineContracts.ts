/** Agent → MCP → Hub → UI pipeline hop identifiers (for logs and tests). */

export type HubClientType = 'webview' | 'mcp-server' | 'unknown';

export const PipelineHop = {
    MCP_REQUEST: 'mcp→hub:feedback_request',
    HUB_ENQUEUE: 'hub:enqueue',
    HUB_BROADCAST: 'hub→ui:session_updated',
    UI_RESPONSE: 'ui→hub:feedback_response',
    MCP_RESULT: 'hub→mcp:feedback_result',
    UI_DISPLAYED: 'ui→hub:session_displayed',
} as const;

export type PipelineHopId = (typeof PipelineHop)[keyof typeof PipelineHop];

/** MCP may send feedback_request before register ack; webview must never send it. */
export function canSendFeedbackRequest(clientType: HubClientType): boolean {
    return clientType === 'mcp-server' || clientType === 'unknown';
}

/** Only the panel webview may resolve a pending feedback session. */
export function canSendFeedbackResponse(clientType: HubClientType): boolean {
    return clientType === 'webview';
}

export function pipelineRejectReason(
    hop: PipelineHopId,
    clientType: HubClientType,
): string | null {
    if (hop === PipelineHop.MCP_REQUEST && !canSendFeedbackRequest(clientType)) {
        return `pipeline_reject:${hop}:client=${clientType}`;
    }
    if (hop === PipelineHop.UI_RESPONSE && !canSendFeedbackResponse(clientType)) {
        return `pipeline_reject:${hop}:client=${clientType}`;
    }
    return null;
}

export function pipelineTraceLine(hop: PipelineHopId, detail: string): string {
    return `pipeline: ${hop} ${detail}`;
}
