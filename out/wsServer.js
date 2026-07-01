"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackWSServer = void 0;
/**
 * Backward-compatible re-export.
 * extension.ts and tests import FeedbackWSServer from here.
 */
var wsHub_1 = require("./server/wsHub");
Object.defineProperty(exports, "FeedbackWSServer", { enumerable: true, get: function () { return wsHub_1.WsHub; } });
//# sourceMappingURL=wsServer.js.map