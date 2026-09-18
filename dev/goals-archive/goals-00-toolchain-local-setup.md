<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §0 elsewhere in GOALS.md point here. -->

## 0. Toolchain / local setup
- [x] JDK 17 installed (Temurin, via winget).
- [x] Android `platform-tools` (adb) installed.
- [x] **Android SDK Platform 37 + matching build-tools installed** — `platforms;android-37.0` +
      `build-tools;37.0.0` installed via `sdkmanager`, `local.properties` created pointing at
      the project-local `android-sdk/` (the system `ANDROID_HOME` pointed at a nonexistent path).
- [x] `app/google-services.json` — created via Firebase Console, placed at `app/google-services.json`
      (`package_name` verified to match `com.example.personalapp`). `./gradlew assembleDebug`
      confirmed green (`processDebugGoogleServices` passes).
- [x] Firebase project confirmed working: Auth (Email/Password) enabled and Firestore Database
      created — both verified live via unauthenticated Identity Toolkit / Firestore REST probes
      (`INVALID_LOGIN_CREDENTIALS` and `403 PERMISSION_DENIED` respectively, not
      `CONFIGURATION_NOT_FOUND` / 404).
