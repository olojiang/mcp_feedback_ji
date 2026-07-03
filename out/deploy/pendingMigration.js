"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planPendingMigration = planPendingMigration;
/** Pure plan for legacy ~/.config/mcp-feedback-enhanced/pending cleanup. */
function planPendingMigration(jsonFiles) {
    if (jsonFiles.length === 0) {
        return { unlinkFiles: [], removeDir: true };
    }
    return { unlinkFiles: jsonFiles.slice(), removeDir: false };
}
//# sourceMappingURL=pendingMigration.js.map