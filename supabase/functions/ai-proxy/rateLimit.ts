// Per-user fixed-window rate limiter kept in isolate memory.
// This is a best-effort guard: Supabase may run several function instances, so the
// effective limit can be a small multiple of the configured value. Hard cost
// protection comes from the quota set on the Gemini API key itself
// (see docs/MOBILE_SETUP.md).

export interface LimitResult {
    ok: boolean;
    retryAfterSec: number;
}

interface Bucket {
    minuteStart: number;
    minuteCount: number;
    dayStart: number;
    dayCount: number;
}

export class RateLimiter {
    private buckets = new Map<string, Bucket>();

    constructor(
        private perMinute: number,
        private perDay: number,
        private maxKeys = 10_000,
    ) {}

    take(key: string, now: number): LimitResult {
        let b = this.buckets.get(key);
        if (!b) {
            if (this.buckets.size >= this.maxKeys) this.buckets.clear();
            b = { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };
            this.buckets.set(key, b);
        }
        if (now - b.minuteStart >= 60_000) {
            b.minuteStart = now;
            b.minuteCount = 0;
        }
        if (now - b.dayStart >= 86_400_000) {
            b.dayStart = now;
            b.dayCount = 0;
        }
        if (b.dayCount >= this.perDay) {
            return { ok: false, retryAfterSec: Math.ceil((b.dayStart + 86_400_000 - now) / 1000) };
        }
        if (b.minuteCount >= this.perMinute) {
            return { ok: false, retryAfterSec: Math.ceil((b.minuteStart + 60_000 - now) / 1000) };
        }
        b.minuteCount++;
        b.dayCount++;
        return { ok: true, retryAfterSec: 0 };
    }
}
