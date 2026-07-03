"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REMINDER_DELAYS_MS = void 0;
exports.scheduleReminderDelays = scheduleReminderDelays;
exports.clearScheduledTimers = clearScheduledTimers;
exports.DEFAULT_REMINDER_DELAYS_MS = [0, 60000, 120000, 300000];
function scheduleReminderDelays(delays, onFire, schedule = setTimeout) {
    return delays.map((delay) => schedule(() => onFire(delay), delay));
}
function clearScheduledTimers(timers) {
    for (const t of timers)
        clearTimeout(t);
}
//# sourceMappingURL=feedbackReminders.js.map