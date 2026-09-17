package com.example.personalapp.di

import com.example.personalapp.data.local.createDataStore
import com.example.personalapp.data.local.getDatabaseBuilder
import com.example.personalapp.data.local.getRoomDatabase
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.Module
import org.koin.dsl.module

// Requires `androidContext(...)` in startKoin (MainApplication).
actual val platformModule: Module = module {
    single { getRoomDatabase(getDatabaseBuilder(androidContext())) }
    single { createDataStore(androidContext()) }
}
