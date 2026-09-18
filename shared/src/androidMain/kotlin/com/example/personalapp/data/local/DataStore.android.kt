package com.example.personalapp.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.FileStorage
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesFileSerializer

fun createDataStore(context: Context): DataStore<Preferences> = createDataStore(
    storage = FileStorage(
        serializer = PreferencesFileSerializer,
        produceFile = {
            context.applicationContext.filesDir.resolve("datastore/$SETTINGS_DATASTORE_FILE_NAME")
        }
    )
)
