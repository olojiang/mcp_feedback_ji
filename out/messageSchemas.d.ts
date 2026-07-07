/**
 * Zod schemas for all WebSocket messages in the MCP Feedback Enhanced system.
 * Flat model — no conversation_id in the protocol.
 */
import { z } from 'zod';
export declare const RegisterSchema: z.ZodObject<{
    type: z.ZodLiteral<"register">;
    clientType: z.ZodEnum<{
        webview: "webview";
        "mcp-server": "mcp-server";
    }>;
}, z.core.$strip>;
export declare const FeedbackRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"feedback_request">;
    summary: z.ZodString;
    project_directory: z.ZodOptional<z.ZodString>;
    trace_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const FeedbackResponseSchema: z.ZodObject<{
    type: z.ZodLiteral<"feedback_response">;
    feedback: z.ZodString;
    images: z.ZodOptional<z.ZodArray<z.ZodString>>;
    session_id: z.ZodOptional<z.ZodString>;
    project_directory: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const QueuePendingSchema: z.ZodObject<{
    type: z.ZodLiteral<"queue-pending">;
    comments: z.ZodArray<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const DismissFeedbackSchema: z.ZodObject<{
    type: z.ZodLiteral<"dismiss_feedback">;
    session_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const SessionUpdatedOutSchema: z.ZodObject<{
    type: z.ZodLiteral<"session_updated">;
    summary: z.ZodString;
    session_id: z.ZodOptional<z.ZodString>;
    session_label: z.ZodOptional<z.ZodString>;
    project_directory: z.ZodOptional<z.ZodString>;
    trace_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const FeedbackSubmittedOutSchema: z.ZodObject<{
    type: z.ZodLiteral<"feedback_submitted">;
    feedback: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const PendingDeliveredOutSchema: z.ZodObject<{
    type: z.ZodLiteral<"pending_delivered">;
    comments: z.ZodArray<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const PendingSyncedOutSchema: z.ZodObject<{
    type: z.ZodLiteral<"pending_synced">;
    comments: z.ZodArray<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const StateSyncOutSchema: z.ZodObject<{
    type: z.ZodLiteral<"state_sync">;
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<{
            ai: "ai";
            user: "user";
            system: "system";
        }>;
        content: z.ZodString;
        timestamp: z.ZodString;
        images: z.ZodOptional<z.ZodArray<z.ZodString>>;
        pending_delivered: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    pending_comments: z.ZodArray<z.ZodString>;
    pending_images: z.ZodArray<z.ZodString>;
    feedback_queue_size: z.ZodNumber;
    pending_sessions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        summary: z.ZodString;
        projectDir: z.ZodOptional<z.ZodString>;
        trace_id: z.ZodOptional<z.ZodString>;
        waiting: z.ZodLiteral<true>;
        mcp_detached: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    hub: z.ZodOptional<z.ZodObject<{
        port: z.ZodNumber;
        pid: z.ZodNumber;
        version: z.ZodString;
        workspaces: z.ZodArray<z.ZodString>;
        webviews: z.ZodNumber;
        mcp_servers: z.ZodNumber;
        pending_count: z.ZodNumber;
        mcp_detached_count: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PreToolUseOutputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    decision: z.ZodLiteral<"allow">;
}, z.core.$strip>, z.ZodObject<{
    decision: z.ZodLiteral<"deny">;
    reason: z.ZodString;
}, z.core.$strip>], "decision">;
export declare const BeforeShellOutputSchema: z.ZodUnion<readonly [z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
    permission: z.ZodLiteral<"deny">;
    user_message: z.ZodString;
    agent_message: z.ZodString;
}, z.core.$strip>]>;
export declare function validateMessage<T extends z.ZodType>(schema: T, data: unknown, context: string): z.infer<T> | null;
