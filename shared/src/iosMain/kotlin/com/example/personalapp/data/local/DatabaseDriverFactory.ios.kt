package com.example.personalapp.data.local

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

actual class DatabaseDriverFactory {
    actual fun createDriver(): SqlDriver {
        // "_v2": kept in sync with the Android actual's filename bump — see its comment for why
        // (a real-device SQLite downgrade crash from the old Room-based app, Android-only in
        // practice since there's no iOS app yet, but naming both platforms' DBs consistently).
        return NativeSqliteDriver(AppDatabase.Schema, "personal_app_database_v2")
    }
}
