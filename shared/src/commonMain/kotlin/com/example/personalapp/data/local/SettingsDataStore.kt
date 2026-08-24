package com.example.personalapp.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.Storage
import androidx.datastore.preferences.core.Preferences

// GOALS.md §18e: the only platform-specific piece DataStore's KMP setup needs is the storage
// backend (Android: FileStorage over a plain file path; iOS: OkioStorage over NSDocumentDirectory)
// — everything else (the actual preference reads/writes in SettingsRepository) is shared.
internal const val SETTINGS_DATASTORE_FILE_NAME = "settings.preferences_pb"

fun createDataStore(storage: Storage<Preferences>): DataStore<Preferences> =
    DataStoreFactory.create(storage = storage)
