import * as path from 'node:path';

export type ProjectPathRelation = 'exact' | 'ancestor' | 'descendant' | 'none';

export function normalizeProjectPath(dir: string): string {
    const normalized = path.normalize(dir);
    const root = path.parse(normalized).root;
    if (normalized === root) return root;
    const stripped = normalized.replace(/[\\/]+$/, '');
    return stripped || root || normalized;
}

export function projectPathRelation(
    entryPath: string | undefined,
    want: string | undefined,
): ProjectPathRelation {
    if (!want) return 'exact';
    if (!entryPath) return 'none';
    const entry = normalizeProjectPath(entryPath);
    const target = normalizeProjectPath(want);
    if (entry === target) return 'exact';
    if (target.startsWith(entry + path.sep)) return 'ancestor';
    if (entry.startsWith(target + path.sep)) return 'descendant';
    return 'none';
}

export function projectPathMatches(
    entryPath: string | undefined,
    want: string | undefined,
): boolean {
    return projectPathRelation(entryPath, want) !== 'none';
}

export function hubAcceptsProject(
    hubWorkspaces: string[],
    projectDirectory?: string,
): boolean {
    if (!projectDirectory) return true;
    if (!hubWorkspaces.length) return true;
    return hubWorkspaces.some((ws) => projectPathMatches(ws, projectDirectory));
}

export function sessionBelongsToPanel(
    panelWorkspace: string | undefined,
    projectDirectory: string | undefined,
    hubWorkspaces?: string[],
): boolean {
    if (!projectDirectory) return true;
    const roots = hubWorkspaces?.length
        ? hubWorkspaces
        : (panelWorkspace ? [panelWorkspace] : []);
    if (!roots.length) return true;
    return roots.some((ws) => projectPathMatches(ws, projectDirectory));
}

export function projectMismatchLogLine(
    want: string,
    hubWorkspaces: string[],
): string {
    return `feedbackRequest: rejected project_mismatch want=${want} hub=${hubWorkspaces.join('|')}`;
}
