export declare let clipboardLogVerbose: boolean;
/** Read image from macOS clipboard as base64 PNG/TIFF. Extension-host safe (no electron). */
export declare function readClipboardImageBase64(): Promise<string | null>;
