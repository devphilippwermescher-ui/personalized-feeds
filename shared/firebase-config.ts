import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBSHzW50UxkGtUuU06CFHz8eA5jtJsvuDI',
  authDomain: 'linkedin-feed-sorter.firebaseapp.com',
  projectId: 'linkedin-feed-sorter',
  storageBucket: 'linkedin-feed-sorter.firebasestorage.app',
  messagingSenderId: '1087764863577',
  appId: '1:1087764863577:web:375df1aac1cc2c2071af48',
  measurementId: 'G-2WXT0K8077',
};

const app: FirebaseApp = initializeApp(firebaseConfig);
const isBrowserPopupEnvironment =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof navigator !== 'undefined';

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

export function getFirebaseApp(): FirebaseApp {
  return app;
}

export function getFirebaseAuth(): Auth {
  return auth;
}

export function getFirebaseDb(): Firestore {
  return db;
}
