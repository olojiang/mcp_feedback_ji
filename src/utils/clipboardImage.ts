import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { appendDailyRotatingLog, localDateKey, localTimestamp } from '../dailyRotatingLog.js'

const execFileAsync = promisify(execFile)
const LOG_DIR = path.join(os.homedir(), '.config', 'mcp-feedback-enhanced', 'logs')

export let clipboardLogVerbose = false;

function clipLog(msg: string): void {
  try {
    appendDailyRotatingLog(LOG_DIR, 'extension', `[${localTimestamp()}] ${msg}`)
  } catch {
    // ignore
  }
}

const JXA_READ_IMAGE = `ObjC.import("AppKit");
var pb=$.NSPasteboard.generalPasteboard;
var types=["public.png","PNG ","public.tiff","NeXT TIFF v4.0 pasteboard type"];
var result="";
for(var i=0;i<types.length;i++){
  var d=pb.dataForType(types[i]);
  if(d){result=ObjC.unwrap($.NSData.alloc.initWithData(d).base64EncodedStringWithOptions(0));break;}
}
result;`

/** Read image from macOS clipboard as base64 PNG/TIFF. Extension-host safe (no electron). */
export async function readClipboardImageBase64(): Promise<string | null> {
  if (process.platform !== 'darwin') return null

  try {
    const pb = await execFileAsync('pbpaste', [], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 })
    const buf = pb.stdout
    if (buf && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) {
      return buf.toString('base64')
    }
  } catch {
    // pbpaste may fail when clipboard has no raw PNG
  }

  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-l', 'JavaScript', '-e', JXA_READ_IMAGE],
      { maxBuffer: 50 * 1024 * 1024 }
    )
    const b64 = (stdout || '').trim()
    if (b64) return b64
  } catch (err) {
    clipLog(`clipboard-paste image err ${err}`)
    return null
  }

  try {
    const { stdout } = await execFileAsync('osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit");var t=$.NSPasteboard.generalPasteboard.types;var r=[];for(var i=0;i<t.count;i++)r.push(ObjC.unwrap(t.objectAtIndex(i)));JSON.stringify(r);',
    ])
    if (clipboardLogVerbose) {
      clipLog(`clipboard-paste no image types=${(stdout || '').trim()}`)
    }
  } catch {
    // ignore
  }

  return null
}
