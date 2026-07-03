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
