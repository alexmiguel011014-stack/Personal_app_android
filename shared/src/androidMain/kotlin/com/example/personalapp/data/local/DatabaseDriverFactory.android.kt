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
// (SQLiteException: Can't downgrade database...), crashing on every launch.
//
// "_v3": same root cause, second occurrence, same real device (2026-08-26, a few hours later)
// — §17 added 3 columns to the `users` table's CREATE TABLE in Users.sq, but SQLDelight has
// no migration verification wired up at all (see CLAUDE.md's data-layer section), so an
// already-created SQLite file on a device just doesn't get the new columns — crashes with
// "table users has no column named canSelfAssess" instead of a clean upgrade. Expect this to
// happen again for every future schema change until real `.sqm` migrations are set up
// (deliberately not done now — this app has no real user data to lose yet, see CLAUDE.md).
// Bumping the filename remains safe for the same reason as "_v2": this local database is a
// disposable Firestore-mirror cache, not a source of truth — losing it just means
// TrainerRepository.startListening() repopulates it from Firestore on next login.
actual class DatabaseDriverFactory(
    private val context: Context,
    private val databaseName: String? = "personal_app_database_v3",
) {
    actual fun createDriver(): SqlDriver {
        return AndroidSqliteDriver(AppDatabase.Schema, context, databaseName)
    }
}
