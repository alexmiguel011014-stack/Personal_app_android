import SwiftUI
import FirebaseCore
import Shared

// GOALS.md §18j: wires the app shell to Koin (KoinBootstrap.kt's initKoin(), Swift's closest
// equivalent to Android's MainApplication.onCreate() — there's no Application/Activity-style
// lifecycle owner here, so this init() is it) and to Firebase. FirebaseApp.configure() needs a
// real GoogleService-Info.plist bundled in the app (see ios-ci.yml's comment on that file) —
// without one this call fails at runtime, same as a missing google-services.json breaks Firebase
// on Android, but doesn't block compiling/building the shell itself.
@main
struct iOSApp: App {
    init() {
        FirebaseApp.configure()
        KoinBootstrapKt.initKoin()
    }

    var body: some Scene {
        WindowGroup {
            ComposeView()
                .ignoresSafeArea(.all)
        }
    }
}
