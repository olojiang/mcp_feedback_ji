export const SOURCE_TAG = 'mcp-feedback-enhanced';
const LEGACY_TAGS = ['mcp-feedback-v2'];
const RETIRED_HOOKS = ['stop', 'sessionStart', 'preCompact'];

export interface HooksConfigPlan {
    changed: boolean;
    existingHooks: Record<string, Array<Record<string, unknown>>>;
    hooksConfig: Record<string, unknown>;
}

export function hooksCommandDrift(
    hooksConfig: Record<string, unknown>,
    nodeBin: string,
    preToolUseHookPath: string,
): boolean {
    const hooks = hooksConfig.hooks as Record<string, Array<Record<string, unknown>>> | undefined;
    const entries = hooks?.preToolUse || [];
    const ours = entries.find((h) => h._source === SOURCE_TAG);
    if (!ours) return true;
    const want = `${nodeBin} ${preToolUseHookPath}`;
    return ours.command !== want;
}

/** Pure plan for ~/.cursor/hooks.json mcp-feedback-enhanced entries. */
export function planHooksConfigUpdate(
    nodeBin: string,
    preToolUseHookPath: string,
    hooksConfig: Record<string, unknown>,
): HooksConfigPlan {
    const next = { ...hooksConfig };
    if (!next.version) next.version = 1;

    const hooks = { ...(next.hooks as Record<string, Array<Record<string, unknown>>> || {}) };
    const hookEntries: Record<string, Record<string, unknown>> = {
        preToolUse: { command: `${nodeBin} ${preToolUseHookPath}` },
    };

    for (const [event, entry] of Object.entries(hookEntries)) {
        if (!hooks[event]) hooks[event] = [];
        hooks[event] = hooks[event].filter((h) =>
            h._source !== SOURCE_TAG && !LEGACY_TAGS.includes(h._source as string),
        );
        hooks[event].push({ ...entry, _source: SOURCE_TAG });
    }

    for (const event of RETIRED_HOOKS) {
        if (hooks[event]) {
            hooks[event] = hooks[event].filter((h) =>
                h._source !== SOURCE_TAG && !LEGACY_TAGS.includes(h._source as string),
            );
            if (hooks[event].length === 0) delete hooks[event];
        }
    }

    next.hooks = hooks;
    const structuralChange = JSON.stringify(hooksConfig.hooks || {}) !== JSON.stringify(hooks);
    const changed = structuralChange || hooksCommandDrift(hooksConfig, nodeBin, preToolUseHookPath);
    return { changed, existingHooks: hooks, hooksConfig: next };
}

export function applyHooksConfigPlan(
    hooksConfig: Record<string, unknown>,
    plan: HooksConfigPlan,
): Record<string, unknown> {
    return { ...hooksConfig, hooks: plan.existingHooks };
}

export const HOOK_FILES = ['hook-utils.js', 'consume-pending.js'];
export const RETIRED_HOOK_FILES = [
    'check-pending.js', 'agent-stop.js', 'session-start.js',
    'enforce-feedback.js', 'track-feedback.js', 'compact-flag.js',
];
