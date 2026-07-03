export type ProjectPathRelation = 'exact' | 'ancestor' | 'descendant' | 'none';
export declare function normalizeProjectPath(dir: string): string;
export declare function projectPathRelation(entryPath: string | undefined, want: string | undefined): ProjectPathRelation;
export declare function projectPathMatches(entryPath: string | undefined, want: string | undefined): boolean;
export declare function hubAcceptsProject(hubWorkspaces: string[], projectDirectory?: string): boolean;
export declare function sessionBelongsToPanel(panelWorkspace: string | undefined, projectDirectory: string | undefined, hubWorkspaces?: string[]): boolean;
export declare function projectMismatchLogLine(want: string, hubWorkspaces: string[]): string;
