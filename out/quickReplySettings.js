"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickRepliesFromConfig = quickRepliesFromConfig;
exports.normalizeQuickReplies = normalizeQuickReplies;
/** Merge workspace settings overrides onto default quick replies. */
function quickRepliesFromConfig(configValue) {
    return normalizeQuickReplies(configValue);
}
function normalizeQuickReplies(custom) {
    const defaults = [
        { id: 'continue', label: 'Continue', text: 'Continue', icon: '\u25B6' },
        { id: 'looks-good', label: 'Looks Good', text: 'Looks good, proceed', icon: '\u2713' },
        { id: 'fix', label: 'Fix', text: 'Please fix the issues', icon: '\u26A1' },
        { id: 'pause', label: 'Pause', text: 'Stop, let me review first', icon: '\u25A0' },
        {
            id: 'test-verify',
            label: 'Test Verify',
            text: 'TDD 充分了吗，测试覆盖全了吗，单测，集成测试，覆盖测试，性能测试，etc？',
            icon: '\u2699',
        },
        { id: 'finished', label: 'Finished', text: 'Finished', icon: '', finished: true },
    ];
    if (!custom?.length) {
        return defaults.map((q) => ({ ...q }));
    }
    const byId = new Map(custom.filter((c) => c?.id).map((c) => [c.id, c]));
    return defaults.map((q) => {
        const o = byId.get(q.id);
        if (!o)
            return { ...q };
        return {
            id: q.id,
            label: o.label || q.label,
            text: o.text || q.text,
            icon: o.icon !== undefined ? o.icon : q.icon,
            finished: o.finished !== undefined ? !!o.finished : !!q.finished,
        };
    });
}
//# sourceMappingURL=quickReplySettings.js.map