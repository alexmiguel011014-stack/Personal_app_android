package com.example.personalapp

import com.example.personalapp.di.iosAppModule
import org.koin.core.context.startKoin

// Deliberately in the root package (com.example.personalapp), same as MainViewController.kt —
// not com.example.personalapp.di, where this originally lived. Kotlin/Native's generated
// Objective-C/Swift facade name for a top-level function apparently isn't just "<FileName>Kt"
// once the file sits in a subpackage (confirmed the hard way: iOSApp.swift's
// `KoinBootstrapKt.initKoin()` call failed with "type 'KoinBootstrapKt' has no member
// 'initKoin'" when this lived in .../di/KoinBootstrap.kt), while MainViewController.kt's
// root-package placement has reliably produced the plain "<FileName>Kt" name documented in its
// own comment. Matching that proven placement instead of guessing the subpackage's real mangled
// name.
fun initKoin() {
    startKoin { modules(iosAppModule) }
}
