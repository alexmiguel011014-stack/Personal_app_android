package com.example.personalapp.data.local

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

actual class DatabaseDriverFactory {
    actual fun createDriver(): SqlDriver {
        // "_v3": kept in sync with the Android actual's filename bumps — see its comment for why
        // (real-device SQLite crashes, Android-only in practice since there's no iOS app yet,
        // but naming both platforms' DBs consistently).
        return NativeSqliteDriver(AppDatabase.Schema, "personal_app_database_v3")
    }
}
