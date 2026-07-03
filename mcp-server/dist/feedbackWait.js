import{createRequire}from'module';const require=createRequire(import.meta.url);
var r=6e4,n=1e4;function a(t,e){return`event=feedback_wait_heartbeat trace=${t||"-"} project=${e||"-"}`}export{r as FEEDBACK_WAIT_HEARTBEAT_MS,n as STDIO_KEEPALIVE_MS,a as feedbackWaitHeartbeatLine};
