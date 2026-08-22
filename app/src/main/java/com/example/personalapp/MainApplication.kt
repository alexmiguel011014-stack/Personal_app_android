package com.example.personalapp

import android.app.Application
import android.content.pm.ApplicationInfo
import android.util.Log
import com.example.personalapp.di.appModule
import com.example.personalapp.shared.sharedModulePlatformName
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // GOALS.md §18c: Koin replaces Hilt (which has no Kotlin Multiplatform support).
        startKoin {
            androidContext(this@MainApplication)
            modules(appModule)
        }
        // GOALS.md §18b toolchain checkpoint: confirms :app actually links against :shared,
        // not just that both modules happen to compile independently.
        Log.d("MainApplication", "Loaded ${sharedModulePlatformName()}")
        // Attests that Firestore/Auth/AI Logic requests come from this real app build, not a
        // script replaying the public API key — see GOALS.md §8. Play Integrity only passes for
        // builds installed through a verified channel (e.g. Play Store); a sideloaded debug build
        // fails that check, so debug builds use the Debug provider instead — its token is logged
        // to Logcat on first run and must be allowlisted once in Firebase Console → App Check →
        // (the app) → Manage debug tokens.
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        val providerFactory = if (isDebuggable) {
            DebugAppCheckProviderFactory.getInstance()
        } else {
            PlayIntegrityAppCheckProviderFactory.getInstance()
        }
        Firebase.appCheck.installAppCheckProviderFactory(providerFactory)
    }
}
