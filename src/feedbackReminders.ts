export const DEFAULT_REMINDER_DELAYS_MS = [0, 60_000, 120_000, 300_000] as const;

export function scheduleReminderDelays(
    delays: readonly number[],
    onFire: (delayMs: number) => void,
    schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
): ReturnType<typeof setTimeout>[] {
    return delays.map((delay) => schedule(() => onFire(delay), delay));
}

export function clearScheduledTimers(timers: ReturnType<typeof setTimeout>[]): void {
    for (const t of timers) clearTimeout(t);
}
