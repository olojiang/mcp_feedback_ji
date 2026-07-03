export declare const SOURCE_TAG = "mcp-feedback-enhanced";
export interface HooksConfigPlan {
    changed: boolean;
    existingHooks: Record<string, Array<Record<string, unknown>>>;
    hooksConfig: Record<string, unknown>;
}
/** Pure plan for ~/.cursor/hooks.json mcp-feedback-enhanced entries. */
export declare function planHooksConfigUpdate(nodeBin: string, preToolUseHookPath: string, hooksConfig: Record<string, unknown>): HooksConfigPlan;
export declare function applyHooksConfigPlan(hooksConfig: Record<string, unknown>, plan: HooksConfigPlan): Record<string, unknown>;
export declare const HOOK_FILES: string[];
export declare const RETIRED_HOOK_FILES: string[];
