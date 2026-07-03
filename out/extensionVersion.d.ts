/** Read package.json version from disk — may be newer than Extension Host in-memory code until Reload. */
export declare function readExtensionVersion(extensionPath: string): string;
/** Version of code currently loaded in Extension Host (may lag disk after deploy). */
export declare function readMemoryExtensionVersion(packageJson: {
    version?: string;
} | undefined): string;
