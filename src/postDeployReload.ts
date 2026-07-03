/** Post-deploy reload checklist shown to the user. */

export function buildPostDeployReloadSteps(version: string): string[] {
    return [
        `MCP Feedback ${version} deployed to disk.`,
        '1. Developer: Reload Window',
        '2. Settings → MCP: toggle mcp-feedback-enhanced off, then on',
        '3. Confirm panel shows the new version',
    ];
}
