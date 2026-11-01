// Firestore I/O for the user document. Kept separate from userData.ts so the
// decision logic can be unit-tested without Firebase.

import { db, doc, getDoc, setDoc } from './firebase';
import { decideInitialData, readLocalBackup, writeLocalBackup, type LoadDecision, type UserData } from './userData';

const userRef = (uid: string) => doc(db, 'users', uid);
const FIELDS = ['profile', 'logs', 'waterData'];

export async function loadUserData(uid: string): Promise<LoadDecision> {
    const backup = readLocalBackup(uid);
    let decision: LoadDecision;
    try {
        // With the persistent cache enabled, getDoc falls back to cached data
        // when offline and only throws if nothing usable is available.
        const snap = await getDoc(userRef(uid));
        decision = decideInitialData({ reachable: true, exists: snap.exists(), data: snap.data() }, backup);
    } catch (error) {
        console.warn('Firestore load failed, using local backup:', (error as { code?: string })?.code ?? 'unknown');
        decision = decideInitialData({ reachable: false }, backup);
    }
    if (decision.writeToCloud) {
        // Fire-and-forget: Firestore queues the write while offline.
        saveUserData(uid, decision.writeToCloud).catch(() => undefined);
    }
    writeLocalBackup(uid, decision.data);
    return decision;
}

/**
 * Replaces the three top-level fields. `mergeFields` (instead of
 * `merge: true`) is deliberate: with a deep merge, workout categories deleted
 * in the app were never removed from Firestore and came back on next load.
 */
export async function saveUserData(uid: string, data: UserData): Promise<void> {
    writeLocalBackup(uid, data);
    await setDoc(userRef(uid), data, { mergeFields: FIELDS });
}
