import { initializeApp } from 'firebase/app';
import {
    getAuth,
    initializeAuth,
    indexedDBLocalPersistence,
    browserLocalPersistence,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    type Auth,
} from 'firebase/auth';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    doc,
    getDoc,
    setDoc,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../firebase-applet-config.json';

export const isNative = Capacitor.isNativePlatform();

const app = initializeApp(firebaseConfig);

// The project uses a *named* Firestore database. It must be passed as the
// third argument; the previous code put it inside the settings object, where
// it was ignored, so the app talked to the non-existent "(default)" database
// and no data was ever synced.
const db = initializeFirestore(
    app,
    { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
    firebaseConfig.firestoreDatabaseId,
);

// In the Android WebView we initialise Auth explicitly with IndexedDB
// persistence and without the popup/redirect resolver (which loads iframes
// that do not work from the https://localhost app origin).
const auth: Auth = isNative
    ? initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
    : getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Google sign-in uses a popup, which is only available in browsers. */
export const googleSignInAvailable = !isNative;

export {
    app,
    db,
    auth,
    googleProvider,
    signInWithPopup,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged,
    doc,
    getDoc,
    setDoc,
};
