export interface DeployStamp {
    version: string;
    at: number;
}
export declare function shouldPromptReloadAfterDeploy(runningVersion: string, stamp: DeployStamp | null): boolean;
/** After deploy, package.json on disk bumps before Extension Host reloads. */
export declare function shouldPromptReloadAfterVersionChange(previousActivated: string | undefined, diskVersion: string): boolean;
