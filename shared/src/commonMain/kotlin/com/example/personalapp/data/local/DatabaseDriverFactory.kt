package com.example.personalapp.data.local

import app.cash.sqldelight.db.SqlDriver

// GOALS.md §18d: the only platform-specific piece SQLDelight's KMP setup needs — Android and iOS
// create their SQLite driver differently. Everything else (schema, queries, adapters) is shared.
expect class DatabaseDriverFactory {
    fun createDriver(): SqlDriver
}
