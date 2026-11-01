import { describe, expect, it } from 'vitest';
import { addDays, goalStreak, localDateKey } from '../lib/date';
import { decideInitialData, emptyUserData, hasUserContent, normalizeUserData } from '../services/userData';
import { reminderTimes, REMINDER_END_HOUR, REMINDER_START_HOUR } from '../services/native';

describe('localDateKey', () => {
    it('uses the local calendar day, not UTC', () => {
        // 00:30 local time on 1 Nov. With toISOString() in UTC+3 this was "2026-10-31".
        const d = new Date(2026, 10, 1, 0, 30);
        expect(localDateKey(d)).toBe('2026-11-01');
    });

    it('zero-pads month and day', () => {
        expect(localDateKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    });
});

describe('goalStreak', () => {
    const today = new Date(2026, 10, 10, 12);
    const key = (offset: number) => localDateKey(addDays(today, offset));

    it('counts consecutive days ending today', () => {
        const log = { [key(0)]: 2500, [key(-1)]: 3000, [key(-2)]: 2500, [key(-3)]: 100 };
        expect(goalStreak(log, 2500, today)).toBe(3);
    });

    it('continues from yesterday when today is not met yet', () => {
        const log = { [key(0)]: 500, [key(-1)]: 3000, [key(-2)]: 2600 };
        expect(goalStreak(log, 2500, today)).toBe(2);
    });

    it('is 0 when neither today nor yesterday met the goal, or goal is 0', () => {
        expect(goalStreak({ [key(-2)]: 3000 }, 2500, today)).toBe(0);
        expect(goalStreak({ [key(0)]: 3000 }, 0, today)).toBe(0);
    });
});

describe('decideInitialData (login data resolution)', () => {
    const backup = { profile: { name: 'Ece', age: '28', weight: '60', height: '165', gender: 'female' }, logs: {}, waterData: { goal: 2000, log: {} } };

    it('cloud document wins when it exists', () => {
        const d = decideInitialData({ reachable: true, exists: true, data: { profile: { name: 'Cloud' } } }, backup);
        expect(d.source).toBe('cloud');
        expect(d.data.profile.name).toBe('Cloud');
        expect(d.writeToCloud).toBeNull();
    });

    it('migrates a local backup with content instead of creating an empty doc', () => {
        const d = decideInitialData({ reachable: true, exists: false }, backup);
        expect(d.source).toBe('migrated-local');
        expect(d.writeToCloud?.profile.name).toBe('Ece');
    });

    it('creates a fresh doc when there is no meaningful backup', () => {
        const d = decideInitialData({ reachable: true, exists: false }, emptyUserData());
        expect(d.source).toBe('new');
        expect(d.writeToCloud).toEqual(emptyUserData());
    });

    it('falls back to the local backup offline without writing', () => {
        expect(decideInitialData({ reachable: false }, backup)).toMatchObject({ source: 'offline-local', writeToCloud: null });
        expect(decideInitialData({ reachable: false }, null).source).toBe('offline-empty');
    });

    it('normalises partial or corrupt data', () => {
        const n = normalizeUserData({ waterData: { goal: 3000, log: 'bad' }, logs: [] });
        expect(n.waterData.goal).toBe(3000);
        expect(n.waterData.log).toEqual({});
        expect(n.logs).toEqual({});
        expect(n.profile.gender).toBe('male');
        expect(hasUserContent(n)).toBe(false);
    });
});

describe('reminderTimes', () => {
    it('schedules only during waking hours within the next 24 h', () => {
        const now = new Date(2026, 10, 1, 21, 0);
        const times = reminderTimes(now, 60);
        expect(times.length).toBeGreaterThan(0);
        for (const t of times) {
            expect(t.getHours()).toBeGreaterThanOrEqual(REMINDER_START_HOUR);
            expect(t.getHours()).toBeLessThan(REMINDER_END_HOUR);
            expect(t.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 3600_000);
        }
        // 22:00..07:59 excluded → first reminder at 08:00 next day
        expect(times[0].getHours()).toBe(8);
    });

    it('caps the number of scheduled notifications', () => {
        expect(reminderTimes(new Date(2026, 10, 1, 8, 0), 15).length).toBeLessThanOrEqual(48);
    });
});
