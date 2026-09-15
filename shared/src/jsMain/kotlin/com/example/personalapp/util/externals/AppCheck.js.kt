@file:JsModule("firebase/app-check")
@file:JsNonModule

package com.example.personalapp.util.externals

// GOALS.md §19e: GitLive wraps no platform's App Check (same gap §18g already documents for
// iOS — native Swift there, native JS here). Mirrors exactly how GitLive's own
// firebase-app/src/jsMain/.../externals/app.kt declares `initializeApp`/`getApp` against
// "firebase/app" — the `firebase` npm package (v10.12.2) is already a transitive dependency of
// :shared's js target via GitLive's firebase-auth/firebase-firestore, so no new npm() Gradle
// dependency is needed for this second entry point of the same package.
external fun initializeAppCheck(app: dynamic, options: dynamic): dynamic

// GOALS.md §19e (revised 2026-09-13): classic reCAPTCHA v3 is deprecated — confirmed live in the
// Firebase Console itself while registering the app ("O reCAPTCHA foi descontinuado. Use o
// reCAPTCHA Enterprise"), not just stale docs. Enterprise is still free up to 10k
// assessments/month (same research as §19a) and is the same "firebase/app-check" module, just a
// different provider class.
external class ReCaptchaEnterpriseProvider(siteKey: String)
