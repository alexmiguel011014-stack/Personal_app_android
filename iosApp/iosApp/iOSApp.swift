import SwiftUI
import FirebaseAppCheck
import FirebaseCore
import Shared

// GOALS.md §18j: wires the app shell to Koin (KoinBootstrap.kt's bootstrapKoin(), Swift's
// closest equivalent to Android's MainApplication.onCreate() — there's no Application/Activity-
// style lifecycle owner here, so this init() is it), Firebase, and App Check (§18g,
// AppCheckProviderFactory.swift). FirebaseApp.configure() needs a real GoogleService-Info.plist
// bundled in the app (see ios-ci.yml's comment on that file) — without one this call fails at
// runtime, same as a missing google-services.json breaks Firebase on Android, but doesn't block
// compiling/building the shell itself.
@main
struct iOSApp: App {
    init() {
        // Must run before configure() — App Check installs itself as part of FirebaseApp's own
        // setup, same reason Android's MainApplication.kt installs its provider factory
        // immediately in onCreate(), before any Firestore/Auth call could happen.
        AppCheck.setProviderFactory(PersonalAppCheckProviderFactory())
        FirebaseApp.configure()
        KoinBootstrapKt.bootstrapKoin()
    }

    var body: some Scene {
        WindowGroup {
            ComposeView()
                .ignoresSafeArea(.all)
        }
    }
}
