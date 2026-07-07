import { WebSocket } from 'ws';
import type { WSMessage } from '../types';
import {
    validateMessage,
    FeedbackRequestSchema,
    FeedbackResponseSchema,
    DismissFeedbackSchema,
    QueuePendingSchema,
    RegisterSchema,
} from '../messageSchemas';
import {
    PipelineHop,
    pipelineRejectReason,
    type HubClientType,
} from '../pipelineContracts';

export interface ConnectedClientRef {
    clientType: 'webview' | 'mcp-server' | 'unknown';
    lastPong: number;
}

export interface MessageRouterDeps {
    onRegister: (clientType: 'webview' | 'mcp-server') => void;
    onFeedbackRequest: (ws: WebSocket, req: { summary: string; project_directory?: string; trace_id?: string }) => void;
    onFeedbackResponse: (res: { feedback: string; images?: string[]; session_id?: string; project_directory?: string }) => void;
    onQueuePending: (qp: { comments: string[]; images?: string[] }) => void;
    onDismiss: (sessionId?: string) => void;
    onGetState: (ws: WebSocket) => void;
    onSessionDisplayed?: (sessionId: string) => void;
    onClipboardWrite?: (ws: WebSocket, msg: { text?: string }) => void;
    onClipboardPaste?: (ws: WebSocket, msg: { request_id?: string }) => void;
    sendPong: (ws: WebSocket) => void;
    onProtocolError: (context: string) => void;
}

export function routeHubMessage(
    ws: WebSocket,
    client: ConnectedClientRef,
    msg: WSMessage,
    deps: MessageRouterDeps
): void {
    switch (msg.type) {
        case 'register': {
            const reg = validateMessage(RegisterSchema, msg, 'register');
            if (!reg) {
                deps.onProtocolError('register');
                break;
            }
            deps.onRegister(reg.clientType);
            break;
        }
        case 'feedback_request': {
            const reject = pipelineRejectReason(
                PipelineHop.MCP_REQUEST,
                client.clientType as HubClientType,
            );
            if (reject) {
                deps.onProtocolError(reject);
                break;
            }
            const req = validateMessage(FeedbackRequestSchema, msg, 'feedback_request');
            if (!req) {
                deps.onProtocolError('feedback_request');
                break;
            }
            deps.onFeedbackRequest(ws, req);
            break;
        }
        case 'feedback_response': {
            const reject = pipelineRejectReason(
                PipelineHop.UI_RESPONSE,
                client.clientType as HubClientType,
            );
            if (reject) {
                deps.onProtocolError(reject);
                break;
            }
            const res = validateMessage(FeedbackResponseSchema, msg, 'feedback_response');
            if (!res) {
                deps.onProtocolError('feedback_response');
                break;
            }
            deps.onFeedbackResponse(res);
            break;
        }
        case 'queue-pending': {
            const qp = validateMessage(QueuePendingSchema, msg, 'queue-pending');
            if (!qp) {
                deps.onProtocolError('queue-pending');
                break;
            }
            deps.onQueuePending(qp);
            break;
        }
        case 'dismiss_feedback': {
            const dismiss = validateMessage(DismissFeedbackSchema, msg, 'dismiss_feedback');
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
            const raw = msg as WSMessage & { session_id?: string };
            const sid = typeof raw.session_id === 'string' ? raw.session_id : '';
            if (sid) deps.onSessionDisplayed?.(sid);
            break;
        }
        case 'clipboard_write': {
            deps.onClipboardWrite?.(ws, msg as { text?: string });
            break;
        }
        case 'clipboard_paste': {
            deps.onClipboardPaste?.(ws, msg as { request_id?: string });
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
