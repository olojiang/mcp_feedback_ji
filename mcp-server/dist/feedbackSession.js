import{createRequire}from'module';const require=createRequire(import.meta.url);
var n="finished";function i(e){return typeof e=="string"&&e.trim().toLowerCase()===n}function s(e){return i(e)?`

[Session] User sent Finished. Task may be closed; do not call interactive_feedback again unless they start a new request.`:`

[Session] Continues until user sends Finished. Call interactive_feedback again before ending your turn.`}export{n as FINISHED_COMMAND,i as isFinishedMessage,s as sessionTailForFeedback};
