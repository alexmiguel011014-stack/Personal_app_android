package com.example.personalapp

import com.example.personalapp.di.iosAppModule
import org.koin.core.context.startKoin

// Not "initKoin" — Kotlin/Native's Objective-C export treats any top-level function starting
// with "init" as colliding with Cocoa's init-family selector convention (NSObject initializers
// have special ARC/memory-management semantics) and silently renames it, e.g. to "doInitKoin".
// Confirmed by dumping the generated Shared.h in CI (GOALS.md §18j): the method showed up as
// `+ (void)doInitKoin __attribute__((swift_name("doInitKoin()")))`, not "initKoin()" — which is
// why iOSApp.swift's original `KoinBootstrapKt.initKoin()` call failed to compile ("has no
// member 'initKoin'"). The root-package placement (matching MainViewController.kt, not
// com.example.personalapp.di) was a red herring from an earlier, wrong theory — package location
// was never the actual problem, this naming collision was.
fun bootstrapKoin() {
    startKoin { modules(iosAppModule) }
}
