export interface QuickReplyOverride {
    id: string;
    label?: string;
    text?: string;
    icon?: string;
    finished?: boolean;
}
export interface QuickReplyItem {
    id: string;
    label: string;
    text: string;
    icon: string;
    finished?: boolean;
}
/** Merge workspace settings overrides onto default quick replies. */
export declare function quickRepliesFromConfig(configValue: QuickReplyOverride[] | undefined): QuickReplyItem[];
declare function normalizeQuickReplies(custom: QuickReplyOverride[] | undefined): QuickReplyItem[];
export { normalizeQuickReplies };
