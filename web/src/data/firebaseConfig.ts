// GOALS.md §23b/§23e: the two values that existed only in the Kotlin/JS build, carried over here so
// §23l can delete shared/src/jsMain without losing them. Copied from jsMain's main.kt
// (webFirebaseOptions) and util/WebAppCheck.js.kt.
//
// These are public client identifiers, not secrets: every browser that loads the site receives
// them. Firebase's security lives in firestore.rules and App Check; the reCAPTCHA key's secret half
// stays in Google Cloud.

/** The "Personal Tracker" web app registered in the Firebase console on 2026-09-13. */
export const firebaseConfig = {
  apiKey: "AIzaSyC8Jeqq2CzMWEU5Do3Tsrbe6hB75u7CZo0",
  authDomain: "personalapp-88129.firebaseapp.com",
  projectId: "personalapp-88129",
  storageBucket: "personalapp-88129.firebasestorage.app",
  messagingSenderId: "681428046020",
  appId: "1:681428046020:web:f8fec8862ed8e00bbb3991",
} as const;

/**
 * reCAPTCHA Enterprise site key for App Check ("personal-tracker-web" in Google Cloud). Its comment
 * in the Kotlin/JS build says it is registered for `localhost` only, and the live github.io deploy
 * logs appCheck/recaptcha-error — so whatever host §23l picks must be added to the key's domains.
 */
export const APP_CHECK_SITE_KEY = "6Lcdc7ktAAAAAPEISgB2tBDOr1jH-tGj2Plk0yt2";

/** The emulator project (firebase.json + `--project`); "demo-" keeps it from reaching a real one. */
export const EMULATOR_PROJECT_ID = "demo-personal-tracker";
