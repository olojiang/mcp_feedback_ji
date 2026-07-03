export interface DeployStamp {
    version: string;
    at: number;
}

export function shouldPromptReloadAfterDeploy(
    runningVersion: string,
    stamp: DeployStamp | null,
): boolean {
    if (!stamp) return false;
    return stamp.version !== runningVersion;
}

/** After deploy, package.json on disk bumps before Extension Host reloads. */
export function shouldPromptReloadAfterVersionChange(
    previousActivated: string | undefined,
    diskVersion: string,
): boolean {
    return !!previousActivated && previousActivated !== diskVersion;
}

export function deployReloadBannerText(
    memoryVersion: string,
    diskVersion: string,
    stamp: DeployStamp | null,
): string {
    if (memoryVersion && diskVersion && memoryVersion !== diskVersion) {
        return `Running ${memoryVersion} — Reload Window to load ${diskVersion} from disk`;
    }
    if (shouldPromptReloadAfterDeploy(memoryVersion, stamp)) {
        return `Deploy ${stamp!.version} on disk — Reload Window (running ${memoryVersion})`;
    }
    return '';
}

export function formatDeployStampLabel(stamp: DeployStamp | null, runningVersion: string): string {
    if (!stamp) return '';
    const when = new Date(stamp.at).toISOString().replace('T', ' ').slice(0, 19);
    if (stamp.version === runningVersion) {
        return `deployed ${stamp.version} at ${when}`;
    }
    return `deploy ${stamp.version} at ${when} — reload for ${runningVersion}`;
}
