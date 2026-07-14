export interface AtSearchResource {
    path: string;
}
export interface AtSearchSymbol {
    name: string;
    resource: AtSearchResource;
    /** Zero-based source line. */
    line: number;
}
export interface AtSearchItem {
    kind: 'folder' | 'file' | 'symbol';
    label: string;
    detail: string;
    insertText: string;
}
export interface AtSearchDependencies {
    findFiles(pattern: string, excludePattern: string, maxResults: number): Promise<AtSearchResource[]>;
    findSymbols(query: string): Promise<AtSearchSymbol[] | undefined>;
    log?(message: string): void;
}
export declare class AtSearchService {
    private readonly dependencies;
    private sequence;
    constructor(dependencies: AtSearchDependencies);
    search(query: string, postResults: (items: AtSearchItem[]) => void): Promise<void>;
}
