import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import {
  FIREBASE_EMULATOR_HOST,
  FIREBASE_EMULATOR_PORTS,
  getAppEnvironment,
  shouldUseFirebaseEmulators,
  type AppEnvironment,
} from './app-environment';

const firebaseConfigs: Record<AppEnvironment, FirebaseOptions> = {
  development: {
    apiKey: 'AIzaSyB6kAzSDEJ8o9kEznq5X6igpUb6Jvlgsk4',
    authDomain: 'myfeedpilot-dev.firebaseapp.com',
    projectId: 'myfeedpilot-dev',
    storageBucket: 'myfeedpilot-dev.firebasestorage.app',
    messagingSenderId: '234163823433',
    appId: '1:234163823433:web:4b6c2fc058aeab076e7098',
    measurementId: 'G-KVZFT26V37',
  },
  staging: {
    apiKey: 'AIzaSyA2zeEsr0lYSGCt4m276mnR9HjgiTUUhEQ',
    authDomain: 'myfeedpilot-staging.firebaseapp.com',
    projectId: 'myfeedpilot-staging',
    storageBucket: 'myfeedpilot-staging.firebasestorage.app',
    messagingSenderId: '701144218123',
    appId: '1:701144218123:web:de3819b26a4d067b29250e',
    measurementId: 'G-NMMJNGW2C5',
  },
  production: {
    apiKey: 'AIzaSyAjF3vVaa_YmgPaQ81hRqo-l5QLM1RUsCs',
    authDomain: 'myfeedpilot-production.firebaseapp.com',
    projectId: 'myfeedpilot-production',
    storageBucket: 'myfeedpilot-production.firebasestorage.app',
    messagingSenderId: '707587386707',
    appId: '1:707587386707:web:2bb76c0038b59107e4c5a6',
    measurementId: 'G-HZ0JZ6SNW6',
  },
};

const firebaseConfig = firebaseConfigs[getAppEnvironment()];
const app: FirebaseApp = initializeApp(firebaseConfig);
const isBrowserPopupEnvironment =
  typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined';

const auth: Auth = initializeAuth(
  app,
  isBrowserPopupEnvironment
    ? {
        persistence: indexedDBLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      }
    : {
        persistence: indexedDBLocalPersistence,
      }
);
const db: Firestore = getFirestore(app);

if (shouldUseFirebaseEmulators()) {
  connectAuthEmulator(auth, `http://${FIREBASE_EMULATOR_HOST}:${FIREBASE_EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS.firestore);
}

export function getFirebaseApp(): FirebaseApp {
  return app;
}

export function getFirebaseAuth(): Auth {
  return auth;
}

export function getFirebaseDb(): Firestore {
  return db;
}
