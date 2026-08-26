package com.example.personalapp.data.local

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

// databaseName defaults to the real on-disk database; tests pass null for an in-memory instance
// (SQLDelight/AndroidSqliteDriver's own documented convention — see AppDaoTest).
//
// "_v2": found on a real device (2026-08-26) — a device that had the old Room-based app
// installed still has a SQLite file named "personal_app_database" at PRAGMA user_version=7
// (Room's own schema version). SQLDelight's generated AppDatabase.Schema starts its own
// versioning fresh at 1, and Android's SQLiteOpenHelper refuses to "downgrade" 7 -> 1
// (SQLiteException: Can't downgrade database...), crashing on every launch. A new filename
// sidesteps the whole problem — safe here specifically because this local database is a
// disposable Firestore-mirror cache, not a source of truth (see CLAUDE.md); losing it just
// means TrainerRepository.startListening() repopulates it from Firestore on next login.
actual class DatabaseDriverFactory(
    private val context: Context,
    private val databaseName: String? = "personal_app_database_v2",
) {
    actual fun createDriver(): SqlDriver {
        return AndroidSqliteDriver(AppDatabase.Schema, context, databaseName)
    }
}
