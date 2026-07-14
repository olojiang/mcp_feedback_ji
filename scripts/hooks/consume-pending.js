#!/usr/bin/env node

const hookUtils = require('./hook-utils');
const {
    isInteractiveFeedbackTool,
    buildFollowupMessage,
    buildDuplicateActiveWaitDeny,
    shouldSkipRulesRefresh,
} = require('./feedback-guard');

const ALLOWLIST_TOOLS = ['interactive_feedback', 'get_system_info', 'mcp-feedback-enhanced'];
const PASSTHROUGH_TOOLS = ['task', 'switchmode', 'read', 'grep', 'glob', 'semanticsearch', 'readlints', 'todowrite', 'askquestion', 'websearch', 'webfetch', 'fetchmcpresource'];
async function consumePending(port) {
    try {
        var result = await hookUtils.httpGet(port, '/pending?consume=1');
        if (result.status === 200 && result.data) {
            var comments = result.data.comments || [];
            if (comments.length > 0 || result.data.images) {
                var combined = comments.join('\n\n') || '(image pending)';
                hookUtils.log('  consumed pending comments=' + comments.length);
                return combined;
            }
        }
        hookUtils.log('  no pending (status=' + result.status + ')');
        return null;
    } catch (err) {
        hookUtils.log('  HTTP error ' + err.message);
        return null;
    }
}

function isAllowlisted(toolName) {
    if (!toolName) return false;
    const lower = toolName.toLowerCase();
    if (ALLOWLIST_TOOLS.some(function (t) { return lower.includes(t.toLowerCase()); })) return true;
    if (PASSTHROUGH_TOOLS.some(function (t) { return lower === t; })) return true;
    return false;
}

function fmtAgent(text) {
    var tail = (text && String(text).trim().toLowerCase() === 'finished')
        ? '\n\nUser sent Finished. You may stop calling interactive_feedback.'
        : '\n\nContinue the task. Call interactive_feedback again before ending your turn, unless user sent Finished.';
    return '[User Feedback] New feedback from user:\n\n"' + text + '"' + tail;
}

function fmtUser(text) {
    return 'Pending comment delivered: "' + text + '"';
}

var _wsKey = '_global';

function updateCounter(toolName) {
    var state = hookUtils.readFeedbackState(_wsKey);
    if (toolName.toLowerCase().includes('interactive_feedback')) {
        state.lastFeedbackAt = Date.now();
        state.toolsSinceFeedback = 0;
    } else {
        state.toolsSinceFeedback = (state.toolsSinceFeedback || 0) + 1;
    }
    state.lastToolAt = Date.now();
    state.lastTool = toolName.toLowerCase();
    hookUtils.writeFeedbackState(state, _wsKey);
    return state;
}

async function checkActiveFeedbackWait(port, traceId) {
    if (!port || !traceId) return null;
    try {
        var result = await hookUtils.httpGet(
            port,
            '/feedback-active?trace_id=' + encodeURIComponent(traceId),
        );
        if (result.status === 200 && result.data && result.data.active) {
            return result.data;
        }
        return null;
    } catch (err) {
        hookUtils.log('  feedback-active error ' + err.message);
        return null;
    }
}

async function runHook(input) {
    if (!input) { hookUtils.output({}); return {}; }

    var hook = input.hook_event_name || 'preToolUse';
    var toolName = input.tool_name || '';
    var workspaceRoots = input.workspace_roots || [];
    var traceId = input.trace_id || input.cursor_trace_id || input.conversation_id || '';
    var loopCount = input.loop_count || 0;

    _wsKey = hookUtils.workspaceKey(workspaceRoots);
    hookUtils.writeAgentContext(workspaceRoots, { traceId: traceId });
    var convId = (input.conversation_id || '').slice(0, 8);
    var genId = (input.generation_id || '').slice(0, 8);
    var isPassthrough = PASSTHROUGH_TOOLS.some(function (t) { return (toolName || '').toLowerCase() === t; });
    if (!isPassthrough) {
        var traceShort = traceId ? String(traceId).slice(0, 8) : '-';
        hookUtils.log(hook + ': tool=' + toolName + ' trace=' + traceShort + ' conv=' + convId + ' gen=' + genId + ' loop=' + loopCount);
    }

    if (hook === 'stop') {
        hookUtils.log('stop: noop — disabled to prevent followup_message loop (status=' + (input.status || '') + ')');
        hookUtils.output({});
        return {};
    }

    if (isAllowlisted(toolName)) {
        if (isInteractiveFeedbackTool(toolName)) {
            var fbServer = hookUtils.findServer(workspaceRoots);
            if (fbServer && traceId) {
                var activeWait = await checkActiveFeedbackWait(fbServer.port, traceId);
                if (shouldSkipRulesRefresh(activeWait)) {
                    hookUtils.log('  event=hooks_feedback_tool trace=' + traceId + ' action=deny_duplicate_active_wait session=' + (activeWait.sessionId || '-'));
                    var duplicateDeny = buildDuplicateActiveWaitDeny(activeWait);
                    hookUtils.output(duplicateDeny);
                    return duplicateDeny;
                }
            }
        }
        if (!isPassthrough) {
            hookUtils.log('  allowlisted tool=' + toolName);
            if (isInteractiveFeedbackTool(toolName)) {
                hookUtils.log('  event=hooks_feedback_tool trace=' + (traceId || '-') + ' action=allow');
            }
        }
        updateCounter(toolName);
        hookUtils.output({}, isPassthrough);
        return {};
    }

    var state = updateCounter(toolName);
    hookUtils.log('  state: sinceF=' + (state.toolsSinceFeedback || 0) + ' lastTool=' + (state.lastTool || ''));
    var server = hookUtils.findServer(workspaceRoots);
    var port = server ? server.port : null;
    if (!port) {
        hookUtils.log('  no server found');
        hookUtils.output({});
        return {};
    }

    var pending = await consumePending(port);
    if (pending) {
        hookUtils.log('  delivering pending via followup_message');
        var pendingFollowup = buildFollowupMessage(fmtAgent(pending));
        hookUtils.output(pendingFollowup);
        return pendingFollowup;
    }
    hookUtils.output({});
    return {};
}

if (require.main === module) {
    runHook(hookUtils.readStdin()).catch(function (err) {
        hookUtils.log('FATAL: ' + err.message);
        hookUtils.output({});
    });
}

module.exports = { runHook };
