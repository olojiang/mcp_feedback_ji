export interface WorkspaceFolderLike {
    uri: { fsPath: string };
}

export function workspacesFromFolders(
    folders: readonly WorkspaceFolderLike[] | undefined,
): string[] {
    return (folders || []).map((f) => f.uri.fsPath);
}

export function substituteWebviewPlaceholders(
    html: string,
    replacements: Record<string, string>,
): string {
    let out = html;
    for (const [key, value] of Object.entries(replacements)) {
        out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return out;
}
