"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeHubMessage = routeHubMessage;
const messageSchemas_1 = require("../messageSchemas");
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
            const req = (0, messageSchemas_1.validateMessage)(messageSchemas_1.FeedbackRequestSchema, msg, 'feedback_request');
            if (!req) {
                deps.onProtocolError('feedback_request');
                break;
            }
            deps.onFeedbackRequest(ws, req);
            break;
        }
        case 'feedback_response': {
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
            deps.onDismiss();
            break;
        }
        case 'get_state': {
            deps.onGetState(ws);
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