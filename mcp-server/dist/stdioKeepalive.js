import{createRequire}from'module';const require=createRequire(import.meta.url);
var a=1e4;function r(e,t){return`event=feedback_wait_heartbeat trace=${e||"-"} project=${t||"-"}`}function c(e){return(t,i)=>{e.sendLoggingMessage({level:"info",data:r(t,i)}).catch(()=>{})}}export{a as STDIO_KEEPALIVE_MS,c as createStdioKeepaliveTick};
