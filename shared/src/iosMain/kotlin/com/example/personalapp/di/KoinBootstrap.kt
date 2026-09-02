package com.example.personalapp.di

import org.koin.core.context.startKoin

// Kept in its own dot-free-named file (not AppModule.ios.kt) so its generated Objective-C/Swift
// facade name is unambiguous — Kotlin/Native derives that name from the file's own name (see
// MainViewController.kt's comment on the same convention), and this is the one function here
// Swift actually calls (from iOSApp.swift's init, in place of Android's
// MainApplication.onCreate() — Swift has no equivalent single lifecycle owner to hang it off).
fun initKoin() {
    startKoin { modules(iosAppModule) }
}
