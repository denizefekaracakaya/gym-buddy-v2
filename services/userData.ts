// Loading and saving the single per-user Firestore document users/{uid}
// ({ profile, logs, waterData } — schema unchanged) plus a localStorage mirror
// used as an offline fallback.

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
        logs: isObj(raw.logs) ? (raw.logs as Record<string, LoggedExercise[]>) : base.logs,
        waterData: { ...base.waterData, ...(water as Partial<WaterData>), log },
    };
}

/** True when the data contains anything the user entered. */
export function hasUserContent(data: UserData): boolean {
    const p = data.profile;
    const profileFilled = [p.name, p.age, p.weight, p.height, p.neck, p.waist, p.hip].some((v) => !!v);
    const logsFilled = Object.values(data.logs).some((list) => Array.isArray(list) && list.length > 0);
    const waterFilled = Object.values(data.waterData.log).some((ml) => ml > 0);
    return profileFilled || logsFilled || waterFilled;
}

export type LoadSource = 'cloud' | 'migrated-local' | 'new' | 'offline-local' | 'offline-empty';

export interface LoadDecision {
    data: UserData;
    source: LoadSource;
    /** Data that must be written to the cloud document (first login / migration). */
    writeToCloud: UserData | null;
}

/**
 * Decides what to show after login.
 *  - cloud doc exists → cloud wins
 *  - no cloud doc, but a local backup with content → upload the backup
 *    (users of the old web build only ever had data in localStorage because
 *    sync was broken; this keeps it instead of overwriting it with an empty doc)
 *  - neither → a fresh document
 *  - cloud unreachable → local backup (or empty), without writing
 */
export function decideInitialData(
    cloud: { reachable: true; exists: boolean; data?: unknown } | { reachable: false },
    localBackup: unknown,
): LoadDecision {
    const local = localBackup === null || localBackup === undefined ? null : normalizeUserData(localBackup);
    if (!cloud.reachable) {
        return local ? { data: local, source: 'offline-local', writeToCloud: null } : { data: emptyUserData(), source: 'offline-empty', writeToCloud: null };
    }
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
        // Storage full or unavailable: the cloud copy (and Firestore's own cache) still exist.
    }
}
