"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeHubMessage = routeHubMessage;
const messageSchemas_1 = require("../messageSchemas");
const pipelineContracts_1 = require("../pipelineContracts");
function routeHubMessage(ws, client, msg, deps) {
    switch (msg.type) {
        case 'register': {
            const reg = (0, messageSchemas_1.validateMessage)(messageSchemas_1.RegisterSchema, msg, 'register');
            if (!reg) {
                deps.onProtocolError('register');
                break;
            }
            deps.onRegister(reg.clientType);
            break;
        }
        case 'feedback_request': {
            const reject = (0, pipelineContracts_1.pipelineRejectReason)(pipelineContracts_1.PipelineHop.MCP_REQUEST, client.clientType);
            if (reject) {
                deps.onProtocolError(reject);
                break;
            }
            const req = (0, messageSchemas_1.validateMessage)(messageSchemas_1.FeedbackRequestSchema, msg, 'feedback_request');
            if (!req) {
                deps.onProtocolError('feedback_request');
                break;
            }
            deps.onFeedbackRequest(ws, req);
            break;
        }
        case 'feedback_response': {
            const reject = (0, pipelineContracts_1.pipelineRejectReason)(pipelineContracts_1.PipelineHop.UI_RESPONSE, client.clientType);
            if (reject) {
                deps.onProtocolError(reject);
                break;
            }
            const res = (0, messageSchemas_1.validateMessage)(messageSchemas_1.FeedbackResponseSchema, msg, 'feedback_response');
            if (!res) {
                deps.onProtocolError('feedback_response');
                break;
            }
            deps.onFeedbackResponse(res);
            break;
        }
        case 'queue-pending': {
            const qp = (0, messageSchemas_1.validateMessage)(messageSchemas_1.QueuePendingSchema, msg, 'queue-pending');
            if (!qp) {
                deps.onProtocolError('queue-pending');
                break;
            }
            deps.onQueuePending(qp);
            break;
        }
        case 'dismiss_feedback': {
            const dismiss = (0, messageSchemas_1.validateMessage)(messageSchemas_1.DismissFeedbackSchema, msg, 'dismiss_feedback');
            if (!dismiss) {
                deps.onProtocolError('dismiss_feedback');
                break;
            }
            deps.onDismiss(dismiss.session_id);
            break;
        }
        case 'get_state': {
            deps.onGetState(ws);
            break;
        }
        case 'session_displayed': {
            const raw = msg;
            const sid = typeof raw.session_id === 'string' ? raw.session_id : '';
            if (sid)
                deps.onSessionDisplayed?.(sid);
            break;
        }
        case 'clipboard_write': {
            deps.onClipboardWrite?.(ws, msg);
            break;
        }
        case 'clipboard_paste': {
            deps.onClipboardPaste?.(ws, msg);
            break;
        }
        case 'ping':
        case 'heartbeat':
            client.lastPong = Date.now();
            deps.sendPong(ws);
            break;
        default:
            deps.onProtocolError('unknown_message_type');
            break;
    }
}
//# sourceMappingURL=messageRouter.js.map