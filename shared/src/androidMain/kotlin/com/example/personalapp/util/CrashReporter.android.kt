package com.example.personalapp.util

import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.crashlytics.crashlytics

actual object CrashReporter {
    actual fun recordException(throwable: Throwable) {
        Firebase.crashlytics.recordException(throwable)
    }

    actual fun log(message: String) {
        Firebase.crashlytics.log(message)
    }
}
