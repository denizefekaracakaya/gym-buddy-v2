/**
 * Calendar-day key in the device's local time zone (YYYY-MM-DD).
 *
 * The original code used `toISOString()`, which is UTC: in Türkiye (UTC+3)
 * anything logged between 00:00 and 03:00 landed on the previous day.
 */
export function localDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Returns a new Date `days` calendar days from `date` (negative = past). */
export function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

/** Number of consecutive days (ending today, or yesterday if today is not met yet) whose value reaches the goal. */
export function goalStreak(log: Record<string, number>, goal: number, today: Date = new Date()): number {
    if (goal <= 0) return 0;
    const met = (d: Date) => (log[localDateKey(d)] || 0) >= goal;
    let cursor = met(today) ? today : addDays(today, -1);
    let streak = 0;
    while (streak < 3650 && met(cursor)) {
        streak++;
        cursor = addDays(cursor, -1);
    }
    return streak;
}
