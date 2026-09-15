package com.example.personalapp.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.okio.OkioStorage
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesSerializer
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import okio.FileSystem
import okio.Path.Companion.toPath
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSUserDomainMask

// GOALS.md §19b: DataStore Multiplatform has no `js` target, so this factory — previously a
// shared commonMain helper (SettingsDataStore.kt, now deleted) — moved fully into the
// android/iOS actuals; only they still reference androidx.datastore types. Filename unchanged
// ("settings.preferences_pb") so existing installs' saved API keys keep reading from the same
// on-disk file, not a fresh empty one.
private const val SETTINGS_DATASTORE_FILE_NAME = "settings.preferences_pb"

@OptIn(ExperimentalForeignApi::class)
actual class SettingsStore {
    private val dataStore: DataStore<Preferences> = DataStoreFactory.create(
        storage = OkioStorage(
            fileSystem = FileSystem.SYSTEM,
            serializer = PreferencesSerializer,
            producePath = {
                val documentDirectory = NSFileManager.defaultManager.URLForDirectory(
                    directory = NSDocumentDirectory,
                    inDomain = NSUserDomainMask,
                    appropriateForURL = null,
                    create = false,
                    error = null,
                )
                (requireNotNull(documentDirectory?.path) + "/$SETTINGS_DATASTORE_FILE_NAME").toPath()
            }
        )
    )

    actual fun observeString(key: String): Flow<String> {
        val prefKey = stringPreferencesKey(key)
        return dataStore.data.map { it[prefKey] ?: "" }
    }

    actual fun observeBoolean(key: String): Flow<Boolean> {
        val prefKey = booleanPreferencesKey(key)
        return dataStore.data.map { it[prefKey] ?: false }
    }

    actual suspend fun setString(key: String, value: String) {
        dataStore.edit { it[stringPreferencesKey(key)] = value }
    }

    actual suspend fun setBoolean(key: String, value: Boolean) {
        dataStore.edit { it[booleanPreferencesKey(key)] = value }
    }
}
