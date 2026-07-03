export declare const DEFAULT_REMINDER_DELAYS_MS: readonly [0, 60000, 120000, 300000];
export declare function scheduleReminderDelays(delays: readonly number[], onFire: (delayMs: number) => void, schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout>[];
export declare function clearScheduledTimers(timers: ReturnType<typeof setTimeout>[]): void;
