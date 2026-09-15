package com.example.personalapp.data.local

import app.cash.sqldelight.db.SqlDriver

// GOALS.md §19c (decided): the web build skips the SQLDelight offline-cache mirror entirely and
// reads Firestore directly — a browser tab already assumes an active connection, unlike a phone
// app. This actual only exists to satisfy the `expect class` contract for the `js` target; it is
// never constructed from web code (the web Koin module wires TrainerRepository/StudentRepository
// without it). A real web SQLDelight driver (`app.cash.sqldelight:web-worker-driver`, Web Worker
// + OPFS-backed) exists and could replace this later if offline support on web is ever wanted.
actual class DatabaseDriverFactory {
    actual fun createDriver(): SqlDriver =
        error("DatabaseDriverFactory is not wired on the web target (GOALS.md §19c) — nothing should call this")
}
