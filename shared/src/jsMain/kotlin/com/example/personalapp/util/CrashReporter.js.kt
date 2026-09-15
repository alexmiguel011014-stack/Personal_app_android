package com.example.personalapp.util

import kotlin.js.console

// GOALS.md §19a: no Firebase Crashlytics equivalent wired for web yet (documented scope cut —
// additive polish, not viability-blocking). Logs to the browser console instead of silently
// dropping the error.
actual object CrashReporter {
    actual fun recordException(throwable: Throwable) {
        console.error(throwable.toString())
    }

    actual fun log(message: String) {
        console.log(message)
    }
}
