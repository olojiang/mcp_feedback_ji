export interface WorkspaceFolderLike {
    uri: {
        fsPath: string;
    };
}
export declare function workspacesFromFolders(folders: readonly WorkspaceFolderLike[] | undefined): string[];
export declare function substituteWebviewPlaceholders(html: string, replacements: Record<string, string>): string;
