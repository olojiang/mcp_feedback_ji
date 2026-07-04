import{createRequire}from'module';const require=createRequire(import.meta.url);
var i=1e4;function r(e,t){return`event=feedback_wait_heartbeat trace=${e||"-"} project=${t||"-"}`}function s(e){return(t,n)=>{e.sendLoggingMessage({level:"info",data:r(t,n)}).catch(()=>{})}}export{i as STDIO_KEEPALIVE_MS,s as createStdioKeepaliveTick};
