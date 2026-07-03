export interface PendingMigrationPlan {
    unlinkFiles: string[];
    removeDir: boolean;
}
/** Pure plan for legacy ~/.config/mcp-feedback-enhanced/pending cleanup. */
export declare function planPendingMigration(jsonFiles: string[]): PendingMigrationPlan;
