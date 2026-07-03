"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestClipboard = createTestClipboard;
function createTestClipboard(overrides = {}) {
    return {
        writeText: overrides.writeText ?? (async () => { }),
        readText: overrides.readText ?? (async () => ''),
    };
}
//# sourceMappingURL=testClipboard.js.map