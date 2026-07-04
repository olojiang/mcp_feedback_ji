#!/usr/bin/env node

const { log, output, readStdin, httpGet, findServer, readFeedbackState, writeFeedbackState, readEnforcementConfig, writeAgentContext, workspaceKey } = require('./hook-utils');

const ALLOWLIST_TOOLS = ['interactive_feedback', 'get_system_info', 'mcp-feedback-enhanced'];
const PASSTHROUGH_TOOLS = ['task', 'switchmode', 'read', 'grep', 'glob', 'semanticsearch', 'readlints', 'todowrite', 'askquestion', 'websearch', 'webfetch', 'fetchmcpresource'];
async function consumePending(port) {
    try {
        var result = await httpGet(port, '/pending?consume=1');
        if (result.status === 200 && result.data) {
            var comments = result.data.comments || [];
            if (comments.length > 0 || result.data.images) {
                var combined = comments.join('\n\n') || '(image pending)';
                log('  consumed pending comments=' + comments.length);
                return combined;
            }
        }
        log('  no pending (status=' + result.status + ')');
        return null;
    } catch (err) {
        log('  HTTP error ' + err.message);
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
        : '\n\nCall interactive_feedback again before ending your turn, unless user sent Finished.';
    return '[User Feedback] New feedback from user:\n\n"' + text + '"' + tail;
}

function fmtUser(text) {
    return 'Pending comment delivered: "' + text + '"';
}

var _wsKey = '_global';

function updateCounter(toolName) {
    var state = readFeedbackState(_wsKey);
    if (toolName.toLowerCase().includes('interactive_feedback')) {
        state.lastFeedbackAt = Date.now();
        state.toolsSinceFeedback = 0;
    } else {
        state.toolsSinceFeedback = (state.toolsSinceFeedback || 0) + 1;
    }
    state.lastToolAt = Date.now();
    state.lastTool = toolName.toLowerCase();
    writeFeedbackState(state, _wsKey);
    return state;
}

async function main() {
    var input = readStdin();
    if (!input) { output({}); return; }

    var hook = input.hook_event_name || 'preToolUse';
    var toolName = input.tool_name || '';
    var workspaceRoots = input.workspace_roots || [];
    var traceId = input.trace_id || input.cursor_trace_id || input.conversation_id || '';
    var loopCount = input.loop_count || 0;

    _wsKey = workspaceKey(workspaceRoots);
    writeAgentContext(workspaceRoots, { traceId: traceId });
    var convId = (input.conversation_id || '').slice(0, 8);
    var genId = (input.generation_id || '').slice(0, 8);
    var isPassthrough = PASSTHROUGH_TOOLS.some(function (t) { return (toolName || '').toLowerCase() === t; });
    if (!isPassthrough) {
        log(hook + ': tool=' + toolName + ' conv=' + convId + ' gen=' + genId + ' loop=' + loopCount);
    }

    if (hook === 'stop') {
        log('stop: noop — disabled to prevent followup_message loop (status=' + (input.status || '') + ')');
        output({});
        return;
    }

    if (isAllowlisted(toolName)) {
        if (!isPassthrough) log('  allowlisted tool=' + toolName);
        updateCounter(toolName);
        output({}, isPassthrough);
        return;
    }

    var state = updateCounter(toolName);
    log('  state: sinceF=' + (state.toolsSinceFeedback || 0) + ' lastTool=' + (state.lastTool || ''));
    var server = findServer(workspaceRoots);
    var port = server ? server.port : null;
    if (!port) {
        log('  no server found, checking enforcement');
        checkEnforcement(state);
        return;
    }

    var pending = await consumePending(port);
    if (pending) {
        log('  delivering pending via deny');
        output({ permission: 'deny', user_message: fmtUser(pending), agent_message: fmtAgent(pending) });
        return;
    }
    checkEnforcement(state);
}

function checkEnforcement(state) {
    var cfg = readEnforcementConfig();
    var count = state.toolsSinceFeedback || 0;
    var lastFeedback = state.lastFeedbackAt || 0;
    var minutesSince = lastFeedback ? (Date.now() - lastFeedback) / 60000 : Infinity;

    var needsRefresh = (count > 0 && count >= cfg.maxToolCalls)
        || (lastFeedback && minutesSince >= cfg.maxMinutes);

    if (needsRefresh) {
        log('  preToolUse: rules refresh (count=' + count + ', minutes=' + Math.round(minutesSince) + ')');
        state.toolsSinceFeedback = 0;
        state.lastFeedbackAt = Date.now();
        writeFeedbackState(state, _wsKey);
        output({
            permission: 'deny',
            user_message: 'Rules refresh',
            agent_message: 'Long task checkpoint: call interactive_feedback to check in with the user, then continue.',
        });
        return;
    }

    output({});
}

main();