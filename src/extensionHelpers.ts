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

/** Prevent broken panel when extension memory is older than disk panel.html after deploy. */
export function sanitizeUnreplacedWebviewPlaceholders(html: string): string {
    return html.replace(/<script\b[^>]*\{\{[A-Z0-9_]+\}\}[^>]*>\s*<\/script>\s*/gi, '');
}
