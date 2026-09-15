package com.example.personalapp.util

// GOALS.md §19b: `dev.gitlive:firebase-crashlytics` publishes no `js` target variant (unlike
// firebase-auth/firebase-firestore, which do) — confirmed via a real `:shared:compileKotlinJs`
// dependency-resolution failure, not guessed. This expect/actual keeps the GitLive Crashlytics
// call out of commonMain so the web target isn't forced to resolve that artifact; android/iOS
// still report to the real Firebase Crashlytics project, matching §5e/§18g's existing behavior
// unchanged. Web has no equivalent yet (19a's documented scope cut) — its actual just logs to
// the browser console.
expect object CrashReporter {
    fun recordException(throwable: Throwable)
    fun log(message: String)
}
