import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const config = {
  // Public Firebase Web App identifiers, safe to ship. Production builds must
  // work reproducibly without an undocumented shell-only configuration.
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCKdbOl94kSQz2rTDoJjggMOy-oGjHbvHg',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ntk-income-opportunity-hunter.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ntk-income-opportunity-hunter',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:813703245101:web:7141d8564c561dd99677a4'
};

export const firebaseConfigured = config.projectId === 'ntk-income-opportunity-hunter' && Boolean(config.apiKey && config.authDomain && config.appId);
export const firebaseApp = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestore = firebaseApp
  ? initializeFirestore(firebaseApp, {
      // Private account documents never enter a shared persistent Firestore
      // cache. Public opportunity display data has its own bounded IDB cache.
      localCache: memoryLocalCache()
    })
  : null;
