#!/usr/bin/env node
/**
 * MCP Feedback Enhanced Server.
 *
 * Tools:
 * - interactive_feedback: Request feedback from user
 * - get_system_info: Return system information
 *
 * Routing: project_directory → hash lookup in servers/<hash>.json, single server fallback.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
import { buildToolDefinitions, createToolCallHandler } from './toolHandlers.js';
import { findExtensionServer, readAgentContext } from './serverDiscovery.js';
import { connectToExtension, requestFeedback } from './extensionClient.js';
import { browserFallback } from './browserFallback.js';
import { registerPostFeedbackHook } from './postFeedbackHooks.js';
import { mcpLog } from './logger.js';
import { createStdioKeepaliveTick } from './stdioKeepalive.js';

import { memosHook } from './hooks/memos.js';
registerPostFeedbackHook(memosHook);

const require = createRequire(import.meta.url);

function readServerVersion(): string {
    if (process.env.MCP_FEEDBACK_VERSION) return process.env.MCP_FEEDBACK_VERSION;
    try {
        const pkg = require('../package.json') as { version?: string };
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

const serverVersion = readServerVersion();

// ─── MCP Server Setup ─────────────────────────────────────

const server = new Server(
    { name: 'mcp-feedback-enhanced', version: serverVersion },
    { capabilities: { tools: {}, logging: {} } }
);

const stdioKeepaliveTick = createStdioKeepaliveTick(server);

const handleToolCall = createToolCallHandler({
    findExtensionServer,
    connectToExtension,
    requestFeedback,
    browserFallback,
    readAgentContext,
    log: mcpLog,
    stdioKeepaliveTick,
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolDefinitions(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args, {
        progressToken: extra._meta?.progressToken,
        sendNotification: extra.sendNotification,
    });
});

// ─── Start ────────────────────────────────────────────────

try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    mcpLog(`[MCP Feedback] Server started version=${serverVersion}`);
} catch (err) {
    console.error('[MCP Feedback] Fatal error:', err);
    process.exit(1);
}
