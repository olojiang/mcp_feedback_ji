"use strict";
/** Agent → MCP → Hub → UI pipeline hop identifiers (for logs and tests). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineHop = void 0;
exports.canSendFeedbackRequest = canSendFeedbackRequest;
exports.canSendFeedbackResponse = canSendFeedbackResponse;
exports.pipelineRejectReason = pipelineRejectReason;
exports.pipelineTraceLine = pipelineTraceLine;
exports.PipelineHop = {
    MCP_REQUEST: 'mcp→hub:feedback_request',
    HUB_ENQUEUE: 'hub:enqueue',
    HUB_BROADCAST: 'hub→ui:session_updated',
    UI_RESPONSE: 'ui→hub:feedback_response',
    MCP_RESULT: 'hub→mcp:feedback_result',
    UI_DISPLAYED: 'ui→hub:session_displayed',
};
/** MCP may send feedback_request before register ack; webview must never send it. */
function canSendFeedbackRequest(clientType) {
    return clientType === 'mcp-server' || clientType === 'unknown';
}
/** Only the panel webview may resolve a pending feedback session. */
function canSendFeedbackResponse(clientType) {
    return clientType === 'webview';
}
function pipelineRejectReason(hop, clientType) {
    if (hop === exports.PipelineHop.MCP_REQUEST && !canSendFeedbackRequest(clientType)) {
        return `pipeline_reject:${hop}:client=${clientType}`;
    }
    if (hop === exports.PipelineHop.UI_RESPONSE && !canSendFeedbackResponse(clientType)) {
        return `pipeline_reject:${hop}:client=${clientType}`;
    }
    return null;
}
function pipelineTraceLine(hop, detail) {
    return `pipeline: ${hop} ${detail}`;
}
//# sourceMappingURL=pipelineContracts.js.map