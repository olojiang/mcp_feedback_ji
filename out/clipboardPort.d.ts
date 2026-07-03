/** Clipboard abstraction — keeps wsHub free of vscode imports. */
export interface ClipboardPort {
    writeText(text: string): Promise<void>;
    readText(): Promise<string>;
}
