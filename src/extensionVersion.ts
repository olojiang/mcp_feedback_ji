import * as fs from 'fs';
import * as path from 'path';

/** Read package.json version from disk — may be newer than Extension Host in-memory code until Reload. */
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

/** Version of code currently loaded in Extension Host (may lag disk after deploy). */
export function readMemoryExtensionVersion(
    packageJson: { version?: string } | undefined,
): string {
    return typeof packageJson?.version === 'string' ? packageJson.version : '0.0.0';
}
