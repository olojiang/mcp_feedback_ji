/**
 * In-memory pending message queue (single queue per extension window).
 *
 * Pending state lives entirely in the extension process.
 * Hooks consume pending via HTTP endpoints on the WS server.
 */
export interface PendingDelivery {
    comments: string[];
    images: string[];
}
export interface PendingEntry {
    comments: string[];
    images: string[];
}
export declare class PendingManager {
    private entry;
    private onDelivered?;
    onPendingDelivered(cb: (delivery: PendingDelivery) => void): void;
    set(comments: string[], images: string[]): void;
    read(): PendingEntry | null;
    consume(): PendingEntry | null;
    clear(): void;
}
