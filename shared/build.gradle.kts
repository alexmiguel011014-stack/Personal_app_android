import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// GOALS.md §18: the shared KMP module — data layer (§18b–§18f) and, since §18h, the whole
// Compose Multiplatform UI. :app is a thin Android shell around it; iosMain exposes
// MainViewController() for the (future) Xcode project.
//
// Uses com.android.kotlin.multiplatform.library, not the classic com.android.library — AGP 9
// made the classic library/application plugins incompatible with the Kotlin Multiplatform
// plugin, this replacement is Google's own recommended migration (developer.android.com/
// kotlin/multiplatform/plugin).
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kotlin.multiplatform.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.googleKsp)
    alias(libs.plugins.androidx.room3)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.compose.compiler)
}

// GOALS.md §18h: the two prompt/reference Markdown files moved from app/src/main/assets/ to
// src/commonMain/composeResources/files/ so both platforms bundle them; read via Res.readBytes.
compose.resources {
    packageOfResClass = "com.example.personalapp.resources"
}

// GOALS.md §18d: Room 3.0 (androidx.room3, stable as of 2026-09-09) is a full artifact/package
// fork of classic androidx.room 2.x, made specifically to be Kotlin-first/multiplatform — not an
// in-place upgrade. Schema files moved from app/schemas/ to here (same package-qualified folder
// name, so migration history is unbroken).
room3 {
    schemaDirectory("$projectDir/schemas")
}

kotlin {
    android {
        namespace = "com.example.personalapp.shared"
        compileSdk = 37
        minSdk = 24
        withHostTest {}
        // JVM 17 (was 11): GitLive's Firebase KMP SDK (GOALS.md §18f) ships JVM-17 bytecode and its
        // API is largely inline functions, which Kotlin refuses to inline into a lower target.
        // :app's compileOptions match this.
        compilations.configureEach {
            compileTaskProvider.configure {
                compilerOptions {
                    jvmTarget.set(JvmTarget.JVM_17)
                }
            }
        }
    }

    // iosX64 (Intel Mac simulator) dropped as of GOALS.md §18d: androidx.room3/androidx.sqlite
    // publish no iosX64 variant (Intel Macs are no longer sold; Xcode's own simulator no longer
    // needs it) — iosArm64 (real devices) + iosSimulatorArm64 (Apple Silicon Mac simulator) cover
    // every real 2026 target.
    listOf(
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            // GOALS.md §18b: Exercise/PerformedSet (data/model) are @Serializable.
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.coroutines.core)
            // GOALS.md §18d: Room 3.0 runtime + the recommended bundled SQLite driver (compiled
            // from source, consistent version across every platform — see BundledSQLiteDriver
            // docs). AppDatabase/AppDao/entities live in commonMain, see data/local/.
            // room3-runtime is `api`, not `implementation`: :app's AppModule.kt (Koin) calls
            // getDatabaseBuilder()/getRoomDatabase(), whose signatures reference
            // RoomDatabase.Builder<AppDatabase> directly, so that type needs to be visible on
            // :app's compile classpath too, not just :shared's own.
            api(libs.androidx.room3.runtime)
            implementation(libs.androidx.sqlite.bundled)
            // GOALS.md §18e: DataStore Preferences KMP core (androidx.datastore 1.1.0+).
            // `api`, same reason as room3-runtime above — :app's AppModule.kt (Koin) wires
            // DataStore<Preferences> directly.
            api(libs.androidx.datastore.core)
            api(libs.androidx.datastore.preferences.core)
            // GOALS.md §18f: Firebase via the community GitLive KMP SDK (Google ships no official
            // Firebase KMP SDK). Android actuals delegate to the official Firebase Android SDK the
            // app already ships; iOS actuals bind to the Firebase iOS SDK, which the iOS app/test
            // binaries must link themselves (CocoaPods/SPM — a macOS-only setup step, see GOALS.md).
            // `api`: :app's Koin module and AuthViewModel touch these types directly.
            api(libs.gitlive.firebase.auth)
            api(libs.gitlive.firebase.firestore)
            implementation(libs.gitlive.firebase.crashlytics)
            // GOALS.md §18f: Ktor replaces HttpURLConnection (JVM-only) for the BYO-key AI
            // providers. Engine per platform below; HttpClient() picks it up automatically.
            // `api`: GenerativeAiService's constructor exposes HttpClient (default-valued).
            api(libs.ktor.client.core)
            // GOALS.md §18h: Compose Multiplatform UI. `api` so :app's MainActivity can call
            // App() / the androidTest golden-path test can drive the screens directly.
            api(compose.runtime)
            api(compose.foundation)
            api(compose.material3)
            api(compose.ui)
            api(compose.materialIconsExtended)
            api(compose.components.resources)
            api(compose.components.uiToolingPreview)
            api(libs.jetbrains.lifecycle.viewmodel.compose)
            api(libs.jetbrains.lifecycle.runtime.compose)
            api(libs.jetbrains.navigation.compose)
            implementation(libs.kotlinx.datetime)
            // Koin for Compose + the viewModel { } DSL / koinViewModel(), all multiplatform.
            api(project.dependencies.platform(libs.koin.bom))
            api(libs.koin.compose)
            api(libs.koin.compose.viewmodel)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
            // Firebase AI Logic (Gemini) — Android-only SDK, hence the expect/actual in
            // data/service/Gemini.*.kt. See GOALS.md §3 for why this backend, §18f for the iOS gap.
            implementation(project.dependencies.platform(libs.firebase.bom))
            implementation(libs.firebase.ai)
            // androidContext() for the Android platform Koin module (di/PlatformModule.android.kt).
            implementation(libs.koin.android)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.ktor.client.mock)
        }
    }
}

dependencies {
    add("kspAndroid", libs.androidx.room3.compiler)
    add("kspIosSimulatorArm64", libs.androidx.room3.compiler)
    add("kspIosArm64", libs.androidx.room3.compiler)
}
