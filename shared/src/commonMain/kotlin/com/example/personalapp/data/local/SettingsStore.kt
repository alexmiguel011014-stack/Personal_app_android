package com.example.personalapp.data.local

import kotlinx.coroutines.flow.Flow

// GOALS.md §19b: replaces a direct DataStore<Preferences> dependency in SettingsRepository —
// androidx.datastore (both datastore-core and datastore-preferences-core) publishes no `js`
// target variant (only `wasmJs`), so referencing that type from commonMain would break Gradle
// dependency resolution for the web target the moment `js()` is added to :shared. No constructor
// declared here (same pattern as DatabaseDriverFactory) so each platform can take its own
// construction args — Android needs a Context, iOS/JS need none.
expect class SettingsStore {
    fun observeString(key: String): Flow<String>
    fun observeBoolean(key: String): Flow<Boolean>
    suspend fun setString(key: String, value: String)
    suspend fun setBoolean(key: String, value: Boolean)
}
