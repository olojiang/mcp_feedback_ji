import{createRequire}from'module';const require=createRequire(import.meta.url);
var n=6e4,a=1e4,r=new Set([1,2,5,10,30,60]);function o(e){return!!(r.has(e)||e>60&&e%60===0)}function _(e,t){return`event=feedback_wait_heartbeat trace=${e||"-"} project=${t||"-"}`}export{n as FEEDBACK_WAIT_HEARTBEAT_MS,a as STDIO_KEEPALIVE_MS,_ as feedbackWaitHeartbeatLine,o as shouldLogHeartbeat};
