import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { APP_CHECK_SITE_KEY, EMULATOR_PROJECT_ID, firebaseConfig } from "./firebaseConfig";

// GOALS.md §23e: the one place the web app connects to Firebase. Everything else takes a Firestore
// or Auth instance as a parameter, so the same code runs against production, the local emulators,
// and the tests.
//
// NEXT_PUBLIC_FIREBASE_EMULATORS=true points the app at the local emulators (firebase.json's ports)
// under the demo project instead of production — how phase 1 is built and exercised without
// touching real data. App Check is skipped there: the emulators don't enforce it.

export interface FirebaseClients {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
  functions: Functions;
}

const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "true";

/** True when the app runs against the local emulators (no App Check there — see getFirebase). */
export const usingEmulators = useEmulators;

let clients: FirebaseClients | null = null;

/** Browser-only: call from client components. Initialises once per page load. */
export function getFirebase(): FirebaseClients {
  if (clients) return clients;
  if (typeof window === "undefined") {
    throw new Error("getFirebase() is browser-only — call it from a client component.");
  }

  const app = getApps().length > 0
    ? getApp()
    : initializeApp(useEmulators ? { ...firebaseConfig, projectId: EMULATOR_PROJECT_ID } : firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, "southamerica-east1");
  // Firebase's own e-mails — the password reset and the §27 verification link — in Portuguese,
  // whatever language the console's templates default to.
  auth.languageCode = "pt-BR";

  if (useEmulators) {
    connectFirestoreEmulator(db, "127.0.0.1", 8081);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  } else {
    // Before any Firestore or Auth call, so the token rides along on the first request — the same
    // order the Kotlin/JS build used (App Check first, then everything else).
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

  clients = { app, db, auth, storage, functions };
  return clients;
}
