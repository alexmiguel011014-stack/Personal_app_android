@file:JsModule("firebase/app")
@file:JsNonModule

package com.example.personalapp.util.externals

// GOALS.md §19e: GitLive's own `FirebaseApp.js` accessor (firebase-app/src/jsMain/.../firebase.kt)
// turned out to be unusable from outside GitLive's module — the class's `js` constructor
// property is `internal`, and Kotlin resolves the identically-named top-level public extension
// property to the (inaccessible) member first, not the extension, so `Firebase.app.js` fails to
// compile with "it is internal in FirebaseApp" (confirmed via a real compile error, not
// guessed). Declaring `getApp()` directly here instead — same "firebase/app" npm entry point
// GitLive's own externals/app.kt binds — returns the exact same default app instance GitLive's
// `Firebase.initialize(...)`/`Firebase.app` already registered; calling it a second time from
// here doesn't create a second app, `getApp()` just looks up the existing one by name.
external fun getApp(): dynamic
