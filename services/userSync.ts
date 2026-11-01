// Supabase I/O for the user's row in public.user_data. Kept separate from
// userData.ts so the decision logic can be unit-tested without a network.

import { supabase } from './supabase';
import {
    decideInitialData,
    isLocalDirty,
    readLocalBackup,
    setLocalDirty,
    writeLocalBackup,
    type LoadDecision,
    type UserData,
} from './userData';

const TABLE = 'user_data';
const TIMEOUT_MS = 10_000;

function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
    return Promise.race([
        Promise.resolve(p),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
}

export async function loadUserData(uid: string): Promise<LoadDecision> {
    const backup = readLocalBackup(uid);
    let decision: LoadDecision;
    try {
        const { data, error } = await withTimeout(
            supabase.from(TABLE).select('profile, logs, water_data').eq('id', uid).maybeSingle(),
        );
        if (error) throw error;
        decision = decideInitialData(
            { reachable: true, exists: !!data, data: data ? { profile: data.profile, logs: data.logs, waterData: data.water_data } : undefined },
            backup,
            isLocalDirty(uid),
        );
    } catch (error) {
        console.warn('Cloud load failed, using local backup:', (error as { code?: string; message?: string })?.code ?? (error as Error)?.message);
        decision = decideInitialData({ reachable: false }, backup);
    }
    writeLocalBackup(uid, decision.data);
    if (decision.writeToCloud) saveUserData(uid, decision.writeToCloud).catch(() => undefined);
    return decision;
}

/**
 * Upserts the whole row. The local mirror is written first and marked
 * "unsynced" until the server confirms, so edits made offline survive app
 * restarts and are uploaded on the next successful save/load.
 */
export async function saveUserData(uid: string, data: UserData): Promise<void> {
    writeLocalBackup(uid, data);
    setLocalDirty(uid, true);
    const { error } = await withTimeout(
        supabase.from(TABLE).upsert(
            { id: uid, profile: data.profile, logs: data.logs, water_data: data.waterData, updated_at: new Date().toISOString() },
            { onConflict: 'id' },
        ),
    );
    if (error) throw error;
    setLocalDirty(uid, false);
}

/** Uploads pending offline changes, if any. */
export async function flushPending(uid: string): Promise<void> {
    if (!isLocalDirty(uid)) return;
    const backup = readLocalBackup(uid);
    if (backup) await saveUserData(uid, decideInitialData({ reachable: false }, backup).data);
}
