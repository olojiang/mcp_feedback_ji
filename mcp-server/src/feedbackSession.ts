export const FINISHED_COMMAND = 'finished'

export function isFinishedMessage(text: string | undefined | null): boolean {
  return typeof text === 'string' && text.trim().toLowerCase() === FINISHED_COMMAND
}

export function sessionTailForFeedback(userFeedback: string | undefined | null): string {
  if (isFinishedMessage(userFeedback)) {
    return '\n\n[Session] User sent Finished. Task may be closed; do not call interactive_feedback again unless they start a new request.'
  }
  return '\n\n[Session] Continues until user sends Finished. Call interactive_feedback again before ending your turn.'
}
