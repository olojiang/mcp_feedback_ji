import { WebSocket } from 'ws';
import type { WSMessage } from '../types';
import type { ConnectedClient } from './clientRegistry';
interface HubRouteHandlers {
    onRegister: (clientType: 'webview' | 'mcp-server') => void;
    onFeedbackRequest: (ws: WebSocket, req: {
        summary: string;
        project_directory?: string;
        trace_id?: string;
    }) => void;
    onFeedbackResponse: (res: {
        feedback: string;
        images?: string[];
        session_id?: string;
        project_directory?: string;
    }) => void;
    onQueuePending: (qp: {
        comments: string[];
        images?: string[];
    }) => void;
    onDismiss: (sessionId?: string) => void;
    onGetState: (ws: WebSocket) => void;
    onSessionDisplayed?: (sessionId: string) => void;
    onClipboardWrite?: (ws: WebSocket, msg: {
        text?: string;
    }) => void;
    onClipboardPaste?: (ws: WebSocket, msg: {
        request_id?: string;
    }) => void;
    sendPong: (ws: WebSocket) => void;
    onProtocolError: (context: string) => void;
}
export declare function dispatchRouteMessage(ws: WebSocket, client: ConnectedClient, msg: WSMessage, handlers: HubRouteHandlers): void;
export {};
