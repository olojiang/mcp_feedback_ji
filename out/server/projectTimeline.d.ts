import type { ConversationMessage } from '../types';
export declare class ProjectTimeline {
    private readonly messageCap;
    private readonly saveDelayMs;
    private saveTimer;
    private messages;
    private workspaces;
    private projHash;
    constructor(messageCap: number, saveDelayMs?: number);
    setWorkspaces(workspaces: string[]): void;
    addMessage(msg: ConversationMessage): void;
    getMessages(): ConversationMessage[];
    dispose(): void;
    private loadFromDisk;
    private saveDebounced;
    private saveNow;
}
