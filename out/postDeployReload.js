"use strict";
/** Post-deploy reload checklist shown to the user. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPostDeployReloadSteps = buildPostDeployReloadSteps;
function buildPostDeployReloadSteps(version) {
    return [
        `MCP Feedback ${version} deployed to disk.`,
        '1. Developer: Reload Window',
        '2. Settings → MCP: toggle mcp-feedback-enhanced off, then on',
        '3. Confirm panel shows the new version',
    ];
}
//# sourceMappingURL=postDeployReload.js.map