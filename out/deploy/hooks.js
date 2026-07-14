"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETIRED_HOOK_FILES = exports.HOOK_FILES = exports.SOURCE_TAG = void 0;
exports.hooksCommandDrift = hooksCommandDrift;
exports.planHooksConfigUpdate = planHooksConfigUpdate;
exports.applyHooksConfigPlan = applyHooksConfigPlan;
exports.SOURCE_TAG = 'mcp-feedback-enhanced';
const LEGACY_TAGS = ['mcp-feedback-v2'];
const RETIRED_HOOKS = ['sessionStart', 'preCompact', 'stop'];
function hooksCommandDrift(hooksConfig, nodeBin, preToolUseHookPath) {
    const hooks = hooksConfig.hooks;
    const entries = hooks?.preToolUse || [];
    const ours = entries.find((h) => h._source === exports.SOURCE_TAG);
    if (!ours)
        return true;
    const want = `${nodeBin} ${preToolUseHookPath}`;
    return ours.command !== want;
}
/** Pure plan for ~/.cursor/hooks.json mcp-feedback-enhanced entries. */
function planHooksConfigUpdate(nodeBin, preToolUseHookPath, hooksConfig) {
    const next = { ...hooksConfig };
    if (!next.version)
        next.version = 1;
    const hooks = { ...(next.hooks || {}) };
    const hookEntries = {
        preToolUse: { command: `${nodeBin} ${preToolUseHookPath}` },
    };
    for (const [event, entry] of Object.entries(hookEntries)) {
        if (!hooks[event])
            hooks[event] = [];
        hooks[event] = hooks[event].filter((h) => h._source !== exports.SOURCE_TAG && !LEGACY_TAGS.includes(h._source));
        hooks[event].push({ ...entry, _source: exports.SOURCE_TAG });
    }
    for (const event of RETIRED_HOOKS) {
        if (hooks[event]) {
            hooks[event] = hooks[event].filter((h) => h._source !== exports.SOURCE_TAG && !LEGACY_TAGS.includes(h._source));
            if (hooks[event].length === 0)
                delete hooks[event];
        }
    }
    next.hooks = hooks;
    const structuralChange = JSON.stringify(hooksConfig.hooks || {}) !== JSON.stringify(hooks);
    const changed = structuralChange || hooksCommandDrift(hooksConfig, nodeBin, preToolUseHookPath);
    return { changed, existingHooks: hooks, hooksConfig: next };
}
function applyHooksConfigPlan(hooksConfig, plan) {
    return { ...hooksConfig, hooks: plan.existingHooks };
}
exports.HOOK_FILES = ['hook-utils.js', 'feedback-guard.js', 'consume-pending.js'];
exports.RETIRED_HOOK_FILES = [
    'check-pending.js', 'agent-stop.js', 'session-start.js',
    'enforce-feedback.js', 'track-feedback.js', 'compact-flag.js',
];
//# sourceMappingURL=hooks.js.map