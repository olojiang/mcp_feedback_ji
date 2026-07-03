export interface WorkspaceFolderLike {
    uri: {
        fsPath: string;
    };
}
export declare function workspacesFromFolders(folders: readonly WorkspaceFolderLike[] | undefined): string[];
export declare function substituteWebviewPlaceholders(html: string, replacements: Record<string, string>): string;
/** Prevent broken panel when extension memory is older than disk panel.html after deploy. */
export declare function sanitizeUnreplacedWebviewPlaceholders(html: string): string;
