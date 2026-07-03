/** Webview retainContextWhenHidden — testable without vscode. */

export function resolveRetainContextWhenHidden(setting: boolean | undefined): boolean {
    return setting === true;
}
