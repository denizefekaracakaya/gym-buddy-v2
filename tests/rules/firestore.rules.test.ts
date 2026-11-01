// Firestore security rules tests. Run with: npm run test:rules
// (starts the Firestore emulator via firebase-tools; needs Java 11+).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;

const validDoc = {
    profile: { name: 'A', age: '30', weight: '80', height: '180', gender: 'male' },
    logs: { Göğüs: [{ id: '1', name: 'Bench Press', sets: [{ weight: '60', reps: '10' }] }] },
    waterData: { goal: 2500, log: { '2026-11-01': 500 }, reminderEnabled: false, reminderInterval: 60 },
};

beforeAll(async () => {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
    env = await initializeTestEnvironment({
        projectId: 'demo-gym-buddy',
        firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
    });
});

afterAll(async () => {
    await env?.cleanup();
});

beforeEach(async () => {
    await env.clearFirestore();
});

describe('users/{uid}', () => {
    it('owner can create, read, update and delete their document', async () => {
        const db = env.authenticatedContext('alice').firestore();
        await assertSucceeds(setDoc(doc(db, 'users/alice'), validDoc));
        await assertSucceeds(getDoc(doc(db, 'users/alice')));
        await assertSucceeds(setDoc(doc(db, 'users/alice'), { logs: {} }, { mergeFields: ['logs'] }));
        await assertSucceeds(deleteDoc(doc(db, 'users/alice')));
    });

    it('unauthenticated users cannot read or write', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'users/alice'), validDoc);
        });
        const db = env.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'users/alice')));
        await assertFails(setDoc(doc(db, 'users/alice'), validDoc));
    });

    it("users cannot read or write someone else's document", async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'users/alice'), validDoc);
        });
        const bob = env.authenticatedContext('bob').firestore();
        await assertFails(getDoc(doc(bob, 'users/alice')));
        await assertFails(setDoc(doc(bob, 'users/alice'), validDoc));
        await assertFails(deleteDoc(doc(bob, 'users/alice')));
    });

    it('listing the users collection is denied', async () => {
        const db = env.authenticatedContext('alice').firestore();
        await assertFails(getDocs(collection(db, 'users')));
    });

    it('rejects unknown top-level fields and wrong types', async () => {
        const db = env.authenticatedContext('alice').firestore();
        await assertFails(setDoc(doc(db, 'users/alice'), { ...validDoc, isAdmin: true }));
        await assertFails(setDoc(doc(db, 'users/alice'), { profile: 'not-a-map' }));
    });

    it('other collections are denied', async () => {
        const db = env.authenticatedContext('alice').firestore();
        await assertFails(getDoc(doc(db, 'test/connection')));
        await assertFails(setDoc(doc(db, 'admin/config'), { a: 1 }));
    });
});
