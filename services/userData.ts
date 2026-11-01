// Per-user data: one row in public.user_data (profile, logs, water_data JSONB)
// plus a localStorage mirror used as offline fallback and as a queue for
// changes made while offline ("dirty" flag).

import type { LoggedExercise, UserProfile, WaterData } from '../types';

export interface UserData {
    profile: UserProfile;
    logs: Record<string, LoggedExercise[]>;
    waterData: WaterData;
}

export const initialProfile: UserProfile = {
    name: '',
    age: '',
    weight: '',
    height: '',
    gender: 'male',
    neck: '',
    waist: '',
    hip: '',
};
export const initialWaterData: WaterData = { goal: 2500, log: {}, reminderEnabled: false, reminderInterval: 60 };

export const emptyUserData = (): UserData => ({
    profile: { ...initialProfile },
    logs: {},
    waterData: { ...initialWaterData, log: {} },
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Normalises whatever is stored (cloud or local) into a complete UserData. */
export function normalizeUserData(raw: unknown): UserData {
    const base = emptyUserData();
    if (!isObj(raw)) return base;
    const water = isObj(raw.waterData) ? raw.waterData : {};
    const log = isObj(water.log) ? (water.log as Record<string, number>) : {};
    return {
        profile: isObj(raw.profile) ? { ...base.profile, ...(raw.profile as Partial<UserProfile>) } : base.profile,
        logs: normalizeLogs(raw.logs),
        waterData: { ...base.waterData, ...(water as Partial<WaterData>), log },
    };
}

/**
 * Logs are a map category → exercises. Rows written by the earlier Supabase
 * prototype wrapped it as { v1: {...}, v2: [...] }; read v1 in that case.
 */
export function normalizeLogs(raw: unknown): Record<string, LoggedExercise[]> {
    if (!isObj(raw)) return {};
    const source = isObj(raw.v1) && ('v2' in raw || Object.keys(raw).length === 1) ? raw.v1 : raw;
    const out: Record<string, LoggedExercise[]> = {};
    for (const [category, list] of Object.entries(source)) {
        if (Array.isArray(list)) out[category] = list as LoggedExercise[];
    }
    return out;
}

/** True when the data contains anything the user entered. */
export function hasUserContent(data: UserData): boolean {
    const p = data.profile;
    const profileFilled = [p.name, p.age, p.weight, p.height, p.neck, p.waist, p.hip].some((v) => !!v);
    const logsFilled = Object.values(data.logs).some((list) => Array.isArray(list) && list.length > 0);
    const waterFilled = Object.values(data.waterData.log).some((ml) => ml > 0);
    return profileFilled || logsFilled || waterFilled;
}

export type LoadSource = 'cloud' | 'migrated-local' | 'local-unsynced' | 'new' | 'offline-local' | 'offline-empty';

export interface LoadDecision {
    data: UserData;
    source: LoadSource;
    /** Data that must be written to the cloud row (first login / migration / unsynced edits). */
    writeToCloud: UserData | null;
}

/**
 * Decides what to show after login.
 *  - local backup has unsynced edits (made offline) → keep them and upload
 *  - cloud row exists → cloud wins
 *  - no cloud row, but a local backup with content → upload the backup
 *  - neither → a fresh row
 *  - cloud unreachable → local backup (or empty); uploaded later
 */
export function decideInitialData(
    cloud: { reachable: true; exists: boolean; data?: unknown } | { reachable: false },
    localBackup: unknown,
    localDirty = false,
): LoadDecision {
    const local = localBackup === null || localBackup === undefined ? null : normalizeUserData(localBackup);
    if (!cloud.reachable) {
        return local ? { data: local, source: 'offline-local', writeToCloud: null } : { data: emptyUserData(), source: 'offline-empty', writeToCloud: null };
    }
    if (local && localDirty) return { data: local, source: 'local-unsynced', writeToCloud: local };
    if (cloud.exists) return { data: normalizeUserData(cloud.data), source: 'cloud', writeToCloud: null };
    if (local && hasUserContent(local)) return { data: local, source: 'migrated-local', writeToCloud: local };
    const fresh = emptyUserData();
    return { data: fresh, source: 'new', writeToCloud: fresh };
}

// ---------- local mirror ----------

const backupKey = (uid: string) => `gym_buddy_backup_${uid}`;

export function readLocalBackup(uid: string): unknown {
    try {
        const s = localStorage.getItem(backupKey(uid));
        return s ? JSON.parse(s) : null;
    } catch {
        return null;
    }
}

export function writeLocalBackup(uid: string, data: UserData): void {
    try {
        localStorage.setItem(backupKey(uid), JSON.stringify(data));
    } catch {
        // Storage full or unavailable: the cloud copy still exists.
    }
}

const dirtyKey = (uid: string) => `gym_buddy_unsynced_${uid}`;

export function isLocalDirty(uid: string): boolean {
    try {
        return localStorage.getItem(dirtyKey(uid)) === '1';
    } catch {
        return false;
    }
}

export function setLocalDirty(uid: string, dirty: boolean): void {
    try {
        if (dirty) localStorage.setItem(dirtyKey(uid), '1');
        else localStorage.removeItem(dirtyKey(uid));
    } catch {
        // ignore
    }
}
