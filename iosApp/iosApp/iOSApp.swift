import SwiftUI

// GOALS.md §18j: minimal first iOS app shell — proves the :shared Kotlin/Native framework
// (a library until now, see MainViewController.kt in shared/src/iosMain) actually links and
// runs as a real app, not just compiles. Deliberately not wired to RoleRouter/Koin/Firebase yet
// (that needs an iOS DI bootstrap equivalent to :app/di/AppModule.kt's androidContext()-based
// one, which doesn't exist yet) — this is the "runnable app shell" milestone, not the full app.
@main
struct iOSApp: App {
    var body: some Scene {
        WindowGroup {
            ComposeView()
                .ignoresSafeArea(.all)
        }
    }
}
