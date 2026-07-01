import * as fs from 'fs';
import * as path from 'path';

/** Read package.json version from disk — Cursor caches context.extension.packageJSON until full app restart. */
export function readExtensionVersion(extensionPath: string): string {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf-8'),
        ) as { version?: string };
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}
