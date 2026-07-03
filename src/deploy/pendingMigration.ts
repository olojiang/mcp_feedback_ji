export interface PendingMigrationPlan {
    unlinkFiles: string[];
    removeDir: boolean;
}

/** Pure plan for legacy ~/.config/mcp-feedback-enhanced/pending cleanup. */
export function planPendingMigration(jsonFiles: string[]): PendingMigrationPlan {
    if (jsonFiles.length === 0) {
        return { unlinkFiles: [], removeDir: true };
    }
    return { unlinkFiles: jsonFiles.slice(), removeDir: false };
}
