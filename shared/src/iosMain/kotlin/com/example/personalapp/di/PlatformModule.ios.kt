package com.example.personalapp.di

import com.example.personalapp.data.local.createDataStore
import com.example.personalapp.data.local.getDatabaseBuilder
import com.example.personalapp.data.local.getRoomDatabase
import com.example.personalapp.data.service.iosAppVersion
import org.koin.core.context.startKoin
import org.koin.core.module.Module
import org.koin.dsl.module

actual val platformModule: Module = module {
    single { getRoomDatabase(getDatabaseBuilder()) }
    single { createDataStore() }
    single { iosAppVersion() }
}

// Called once from the iOS app's entry point (Swift) before MainViewController() is shown —
// the iOS counterpart of MainApplication.onCreate()'s startKoin.
fun initKoin() {
    startKoin {
        modules(platformModule, sharedModule)
    }
}
