package com.example.personalapp.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.Storage
import androidx.datastore.preferences.core.Preferences

// Same on-disk name Android's old Context.preferencesDataStore(name = "settings") delegate
// always used ("datastore/settings.preferences_pb", relative to filesDir) — preserved exactly so
// an already-installed app keeps reading its saved API keys. Also referenced by
// backup_rules.xml/data_extraction_rules.xml's exclusion rule (GOALS.md §8) — unaffected by this
// move since the path itself doesn't change, only how it's constructed.
const val SETTINGS_DATASTORE_FILE_NAME = "settings.preferences_pb"

fun createDataStore(storage: Storage<Preferences>): DataStore<Preferences> =
    DataStoreFactory.create(storage = storage)
