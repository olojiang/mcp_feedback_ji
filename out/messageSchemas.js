"use strict";
/**
 * Zod schemas for all WebSocket messages in the MCP Feedback Enhanced system.
 * Flat model — no conversation_id in the protocol.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BeforeShellOutputSchema = exports.PreToolUseOutputSchema = exports.StateSyncOutSchema = exports.PendingSyncedOutSchema = exports.PendingDeliveredOutSchema = exports.FeedbackSubmittedOutSchema = exports.SessionUpdatedOutSchema = exports.DismissFeedbackSchema = exports.QueuePendingSchema = exports.FeedbackResponseSchema = exports.FeedbackRequestSchema = exports.RegisterSchema = void 0;
exports.validateMessage = validateMessage;
const zod_1 = require("zod");
// ─── 1. Incoming to Extension (from MCP Server) ──────────────────────────────
exports.RegisterSchema = zod_1.z.object({
    type: zod_1.z.literal('register'),
    clientType: zod_1.z.enum(['mcp-server', 'webview']),
});
exports.FeedbackRequestSchema = zod_1.z.object({
    type: zod_1.z.literal('feedback_request'),
    summary: zod_1.z.string().min(1),
    project_directory: zod_1.z.string().optional(),
});
// ─── 2. Incoming to Extension (from Webview) ────────────────────────────────
exports.FeedbackResponseSchema = zod_1.z.object({
    type: zod_1.z.literal('feedback_response'),
    feedback: zod_1.z.string(),
    images: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.QueuePendingSchema = zod_1.z.object({
    type: zod_1.z.literal('queue-pending'),
    comments: zod_1.z.array(zod_1.z.string()),
    images: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.DismissFeedbackSchema = zod_1.z.object({
    type: zod_1.z.literal('dismiss_feedback'),
});
// ─── 3. Outgoing from Extension (to Webview) ───────────────────────────────
exports.SessionUpdatedOutSchema = zod_1.z.object({
    type: zod_1.z.literal('session_updated'),
    summary: zod_1.z.string(),
});
exports.FeedbackSubmittedOutSchema = zod_1.z.object({
    type: zod_1.z.literal('feedback_submitted'),
    feedback: zod_1.z.string().optional(),
});
exports.PendingDeliveredOutSchema = zod_1.z.object({
    type: zod_1.z.literal('pending_delivered'),
    comments: zod_1.z.array(zod_1.z.string()),
    images: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.PendingSyncedOutSchema = zod_1.z.object({
    type: zod_1.z.literal('pending_synced'),
    comments: zod_1.z.array(zod_1.z.string()),
    images: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.StateSyncOutSchema = zod_1.z.object({
    type: zod_1.z.literal('state_sync'),
    messages: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(['ai', 'user', 'system']),
        content: zod_1.z.string(),
        timestamp: zod_1.z.string(),
        images: zod_1.z.array(zod_1.z.string()).optional(),
        pending_delivered: zod_1.z.boolean().optional(),
    })),
    pending_comments: zod_1.z.array(zod_1.z.string()),
    pending_images: zod_1.z.array(zod_1.z.string()),
    feedback_queue_size: zod_1.z.number(),
});
// ─── 4. Hook output schemas (for contract tests) ───────────────────────────
exports.PreToolUseOutputSchema = zod_1.z.discriminatedUnion('decision', [
    zod_1.z.object({ decision: zod_1.z.literal('allow') }),
    zod_1.z.object({ decision: zod_1.z.literal('deny'), reason: zod_1.z.string().min(1) }),
]);
exports.BeforeShellOutputSchema = zod_1.z.union([
    zod_1.z.object({}),
    zod_1.z.object({
        permission: zod_1.z.literal('deny'),
        user_message: zod_1.z.string().min(1),
        agent_message: zod_1.z.string().min(1),
    }),
]);
// ─── 5. Helper function for validation ──────────────────────────────────────
function validateMessage(schema, data, context) {
    const result = schema.safeParse(data);
    if (!result.success) {
        console.warn(`[MCP Feedback] Invalid ${context}:`, result.error.issues.map((i) => i.message).join(', '));
        return null;
    }
    return result.data;
}
//# sourceMappingURL=messageSchemas.js.map