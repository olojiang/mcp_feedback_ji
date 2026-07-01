"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readClipboardImageBase64 = readClipboardImageBase64;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs');
function clipLog(msg) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(path.join(LOG_DIR, 'extension.log'), `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch {
        // ignore
    }
}
const JXA_READ_IMAGE = `ObjC.import("AppKit");
var pb=$.NSPasteboard.generalPasteboard;
var types=["public.png","PNG ","public.tiff","NeXT TIFF v4.0 pasteboard type"];
for(var i=0;i<types.length;i++){
  var d=pb.dataForType(types[i]);
  if(d){console.log($.NSData.alloc.initWithData(d).base64EncodedStringWithOptions(0).js);break;}
}`;
/** Read image from macOS clipboard as base64 PNG/TIFF. Extension-host safe (no electron). */
async function readClipboardImageBase64() {
    if (process.platform !== 'darwin')
        return null;
    try {
        const pb = await execFileAsync('pbpaste', [], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
        const buf = pb.stdout;
        if (buf && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) {
            return buf.toString('base64');
        }
    }
    catch {
        // pbpaste may fail when clipboard has no raw PNG
    }
    try {
        const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', JXA_READ_IMAGE], { maxBuffer: 50 * 1024 * 1024 });
        const b64 = (stdout || '').trim();
        if (b64)
            return b64;
    }
    catch (err) {
        clipLog(`clipboard-paste image err ${err}`);
        return null;
    }
    try {
        const { stdout } = await execFileAsync('osascript', [
            '-l',
            'JavaScript',
            '-e',
            'ObjC.import("AppKit");JSON.stringify($.NSPasteboard.generalPasteboard.types.js);',
        ]);
        clipLog(`clipboard-paste no image types=${(stdout || '').trim()}`);
    }
    catch {
        // ignore
    }
    return null;
}
//# sourceMappingURL=clipboardImage.js.map