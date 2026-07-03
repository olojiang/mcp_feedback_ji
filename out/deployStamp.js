"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldPromptReloadAfterDeploy = shouldPromptReloadAfterDeploy;
exports.shouldPromptReloadAfterVersionChange = shouldPromptReloadAfterVersionChange;
exports.deployReloadBannerText = deployReloadBannerText;
exports.formatDeployStampLabel = formatDeployStampLabel;
function shouldPromptReloadAfterDeploy(runningVersion, stamp) {
    if (!stamp)
        return false;
    return stamp.version !== runningVersion;
}
/** After deploy, package.json on disk bumps before Extension Host reloads. */
function shouldPromptReloadAfterVersionChange(previousActivated, diskVersion) {
    return !!previousActivated && previousActivated !== diskVersion;
}
function deployReloadBannerText(memoryVersion, diskVersion, stamp) {
    if (memoryVersion && diskVersion && memoryVersion !== diskVersion) {
        return `Running ${memoryVersion} — Reload Window to load ${diskVersion} from disk`;
    }
    if (shouldPromptReloadAfterDeploy(memoryVersion, stamp)) {
        return `Deploy ${stamp.version} on disk — Reload Window (running ${memoryVersion})`;
    }
    return '';
}
function formatDeployStampLabel(stamp, runningVersion) {
    if (!stamp)
        return '';
    const when = new Date(stamp.at).toISOString().replace('T', ' ').slice(0, 19);
    if (stamp.version === runningVersion) {
        return `deployed ${stamp.version} at ${when}`;
    }
    return `deploy ${stamp.version} at ${when} — reload for ${runningVersion}`;
}
//# sourceMappingURL=deployStamp.js.map