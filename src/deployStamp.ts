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

export function formatDeployStampLabel(stamp: DeployStamp | null, runningVersion: string): string {
    if (!stamp) return '';
    const when = new Date(stamp.at).toISOString().replace('T', ' ').slice(0, 19);
    if (stamp.version === runningVersion) {
        return `deployed ${stamp.version} at ${when}`;
    }
    return `deploy ${stamp.version} at ${when} — reload for ${runningVersion}`;
}
