import FirebaseAppCheck
import FirebaseCore

// iOS counterpart to :app/MainApplication.kt's App Check wiring (GOALS.md §18g) — GitLive's
// Firebase SDK doesn't wrap App Check, so unlike Auth/Firestore/Crashlytics this has no Kotlin
// commonMain equivalent; it's native Swift, called from iOSApp.swift's init(). #if DEBUG mirrors
// Android's ApplicationInfo.FLAG_DEBUGGABLE runtime check: the debug provider's token must be
// allowlisted once in Firebase Console -> App Check -> (the app) -> Manage debug tokens, same
// process as Android's (see MainApplication.kt's comment) — it's logged to the Xcode console on
// first run. App Attest (the release-build provider, Apple's Play-Integrity equivalent) needs a
// real device and iOS 14+; this app's deployment target is 15.0, so no DeviceCheck fallback is
// needed for older OS versions.
final class PersonalAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        #if DEBUG
        return AppCheckDebugProvider(app: app)
        #else
        return AppAttestProvider(app: app)
        #endif
    }
}
