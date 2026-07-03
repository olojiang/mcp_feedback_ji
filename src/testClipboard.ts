import type { ClipboardPort } from './clipboardPort.js';

export function createTestClipboard(overrides: Partial<ClipboardPort> = {}): ClipboardPort {
    return {
        writeText: overrides.writeText ?? (async () => {}),
        readText: overrides.readText ?? (async () => ''),
    };
}
