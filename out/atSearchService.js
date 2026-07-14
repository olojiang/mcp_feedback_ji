"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtSearchService = void 0;
const EXCLUDE_PATTERN = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.next/**,**/build/**}';
function normalizePath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}
function compareItems(left, right) {
    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true })
        || left.detail.localeCompare(right.detail, undefined, { sensitivity: 'base', numeric: true });
}
function matchingDirectories(relativePath, lowerQuery) {
    const parts = relativePath.split('/');
    const directories = [];
    for (let index = 0; index < parts.length - 1; index++) {
        if (parts[index].toLowerCase().includes(lowerQuery)) {
            directories.push(`${parts.slice(0, index + 1).join('/')}/`);
        }
    }
    return directories;
}
class AtSearchService {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.sequence = 0;
    }
    async search(query, postResults) {
        const sequence = ++this.sequence;
        if (!query) {
            postResults([]);
            return;
        }
        const [fileResult, directoryResult, symbolResult] = await Promise.allSettled([
            this.dependencies.findFiles(`**/*${query}*`, EXCLUDE_PATTERN, 30),
            this.dependencies.findFiles(`**/*${query}*/*`, EXCLUDE_PATTERN, 20),
            this.dependencies.findSymbols(query),
        ]);
        if (sequence !== this.sequence)
            return;
        const lowerQuery = query.toLowerCase();
        const directories = new Set();
        const files = [];
        const symbols = [];
        if (fileResult.status === 'fulfilled') {
            for (const resource of fileResult.value) {
                const relativePath = normalizePath(resource.path);
                files.push({
                    kind: 'file',
                    label: relativePath.split('/').pop() ?? relativePath,
                    detail: relativePath,
                    insertText: relativePath,
                });
                for (const directory of matchingDirectories(relativePath, lowerQuery)) {
                    directories.add(directory);
                }
            }
        }
        else {
            this.dependencies.log?.(`at-search file error: ${String(fileResult.reason)}`);
        }
        if (directoryResult.status === 'fulfilled') {
            for (const resource of directoryResult.value) {
                const relativePath = normalizePath(resource.path);
                for (const directory of matchingDirectories(relativePath, lowerQuery)) {
                    directories.add(directory);
                }
            }
        }
        else {
            this.dependencies.log?.(`at-search directory error: ${String(directoryResult.reason)}`);
        }
        if (symbolResult.status === 'fulfilled') {
            for (const symbol of symbolResult.value ?? []) {
                const relativePath = normalizePath(symbol.resource.path);
                const line = symbol.line + 1;
                symbols.push({
                    kind: 'symbol',
                    label: symbol.name,
                    detail: `${relativePath}:${line}`,
                    insertText: `${symbol.name} (${relativePath}:${line})`,
                });
            }
        }
        else {
            this.dependencies.log?.(`at-search symbol error: ${String(symbolResult.reason)}`);
        }
        const folders = Array.from(directories, (directory) => ({
            kind: 'folder',
            label: directory,
            detail: 'directory',
            insertText: directory,
        })).sort(compareItems).slice(0, 8);
        const seen = new Set();
        const unique = [...folders, ...files.sort(compareItems), ...symbols.sort(compareItems).slice(0, 10)]
            .filter((item) => {
            if (seen.has(item.insertText))
                return false;
            seen.add(item.insertText);
            return true;
        })
            .slice(0, 20);
        postResults(unique);
    }
}
exports.AtSearchService = AtSearchService;
//# sourceMappingURL=atSearchService.js.map