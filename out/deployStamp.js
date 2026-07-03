"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldPromptReloadAfterDeploy = shouldPromptReloadAfterDeploy;
exports.shouldPromptReloadAfterVersionChange = shouldPromptReloadAfterVersionChange;
function shouldPromptReloadAfterDeploy(runningVersion, stamp) {
    if (!stamp)
        return false;
    return stamp.version !== runningVersion;
}
/** After deploy, package.json on disk bumps before Extension Host reloads. */
function shouldPromptReloadAfterVersionChange(previousActivated, diskVersion) {
    return !!previousActivated && previousActivated !== diskVersion;
}
//# sourceMappingURL=deployStamp.js.map