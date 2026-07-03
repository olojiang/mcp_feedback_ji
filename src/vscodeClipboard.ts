import * as vscode from 'vscode';
import type { ClipboardPort } from './clipboardPort.js';

export function createVscodeClipboard(): ClipboardPort {
    return {
        writeText: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
        readText: () => Promise.resolve(vscode.env.clipboard.readText()),
    };
}
