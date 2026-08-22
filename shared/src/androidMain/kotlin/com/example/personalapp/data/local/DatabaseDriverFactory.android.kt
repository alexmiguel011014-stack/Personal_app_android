package com.example.personalapp.data.local

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

// databaseName defaults to the real on-disk database; tests pass null for an in-memory instance
// (SQLDelight/AndroidSqliteDriver's own documented convention — see AppDaoTest).
actual class DatabaseDriverFactory(
    private val context: Context,
    private val databaseName: String? = "personal_app_database",
) {
    actual fun createDriver(): SqlDriver {
        return AndroidSqliteDriver(AppDatabase.Schema, context, databaseName)
    }
}
