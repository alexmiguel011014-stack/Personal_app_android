package com.example.personalapp.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.okio.OkioStorage
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesSerializer
import okio.FileSystem
import okio.Path.Companion.toOkioPath

fun createDataStore(context: Context): DataStore<Preferences> = createDataStore(
    storage = OkioStorage(
        fileSystem = FileSystem.SYSTEM,
        serializer = PreferencesSerializer,
        producePath = { context.filesDir.resolve(SETTINGS_DATASTORE_FILE_NAME).toOkioPath() },
    )
)
