/**
 * Shared type definitions for MCP Feedback Enhanced.
 * Flat per-window model — no conversation_id in the protocol.
 */
export type PanelMode = 'idle' | 'running' | 'waiting';
export interface ConversationMessage {
    role: 'ai' | 'user' | 'system';
    content: string;
    timestamp: string;
    images?: string[];
    pending_delivered?: boolean;
}
export interface ProjectState {
    projectPath: string;
    messages: ConversationMessage[];
    lastActive: number;
}
export interface ServerInfo {
    port: number;
    pid: number;
    projectPath: string;
    version: string;
    started_at: number;
}
export interface WSMessage {
    type: string;
    [key: string]: unknown;
}
export interface FeedbackRequest {
    type: 'feedback_request';
    summary: string;
    project_directory?: string;
}
export interface FeedbackResponse {
    type: 'feedback_response';
    feedback: string;
    images?: string[];
}
