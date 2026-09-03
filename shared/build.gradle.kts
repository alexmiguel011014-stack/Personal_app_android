import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// GOALS.md §18b/§18d: the shared KMP module. Uses com.android.kotlin.multiplatform.library,
// not the classic com.android.library — AGP 9 made the classic library/application plugins
// incompatible with the Kotlin Multiplatform plugin, this replacement is Google's own
// recommended migration (developer.android.com/kotlin/multiplatform/plugin).
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kotlin.multiplatform.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.sqldelight)
    // GOALS.md §18h: screens/ViewModels move here from :app.
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.compose.compiler)
    // GOALS.md §18f: "iOS Firebase native framework linking" — GitLive's iOS artifacts are
    // cinterop bindings against Apple's real Firebase iOS SDK .frameworks; those binaries have
    // to come from somewhere, and CocoaPods (via this plugin) is the standard way to get them
    // wired into a Kotlin/Native link. Without this, :shared:iosSimulatorArm64Test fails with
    // `ld: framework 'FirebaseCore' not found` (confirmed, see ios-ci.yml's disabled test step).
    // No version here (not via the version catalog like the others) — this subplugin ships
    // inside the same artifact as org.jetbrains.kotlin.multiplatform above, so it's already on
    // the classpath at that plugin's version; giving it an explicit version here makes Gradle
    // treat it as a second, separately-resolved copy and fail with "already on the classpath
    // with an unknown version, so compatibility cannot be checked" (confirmed locally).
    id("org.jetbrains.kotlin.native.cocoapods")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }

    android {
        namespace = "com.example.personalapp.shared"
        compileSdk = 37
        minSdk = 24
        withHostTest {}
        compilations.configureEach {
            compileTaskProvider.configure {
                compilerOptions {
                    // 11 → 17 for GOALS.md §18f: GitLive's Firebase artifacts ship inline reified
                    // functions built at JVM target 17; inlining them at 11 fails to compile.
                    jvmTarget.set(JvmTarget.JVM_17)
                }
            }
        }
    }

    // iosX64 (Intel simulator) deliberately excluded — every real device/CI target here is
    // Apple Silicon (confirmed during the Room investigation that some androidx multiplatform
    // artifacts don't even publish an iosX64 variant; keeping the exclusion for consistency).
    iosArm64()
    iosSimulatorArm64()

    // GOALS.md §18f: the framework{} block here (baseName/isStatic) replaces the old manual
    // `iosTarget.binaries.framework {}` loop — the cocoapods plugin owns framework config once
    // it's applied, since it also has to inject each pod's headers/link flags into the same
    // framework build. One `pod(...)` per Firebase product actually used (see gitlive-firebase-*
    // in commonMain.dependencies above) — each pulls in FirebaseCore transitively, so it isn't
    // listed separately.
    cocoapods {
        summary = "Personal Tracker shared KMP module"
        homepage = "https://github.com/alexmiguel011014-stack/Personal_app_android"
        version = "1.0"
        ios.deploymentTarget = "15.0"
        framework {
            baseName = "Shared"
            isStatic = true
        }
        pod("FirebaseAuth")
        pod("FirebaseFirestore")
        pod("FirebaseCrashlytics")
        // GOALS.md §18g: GitLive has no App Check wrapper, so the actual provider wiring is
        // native Swift (iosApp/iosApp/AppCheckProviderFactory.swift), not Kotlin — this pod line
        // just makes the FirebaseAppCheck framework available to link against.
        pod("FirebaseAppCheck")
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.coroutines.extensions)
            // api, not implementation: :app's AppModule.kt (Koin) references DataStore<Preferences>
            // directly (single { createDataStore(androidContext()) }), so these types must be
            // visible on :app's compile classpath, not just :shared's internal one.
            api(libs.androidx.datastore.core)
            api(libs.androidx.datastore.preferences.core)
            // GitLive Kotlin Firebase SDK (GOALS.md §18f) — Google ships no official Firebase KMP
            // SDK, this is the established community alternative. :app's AppModule.kt/AdminViewModel
            // reference FirebaseAuth/FirebaseFirestore directly, hence api not implementation.
            api(libs.gitlive.firebase.auth)
            api(libs.gitlive.firebase.firestore)
            // implementation, not api: only used internally by TrainerRepository's snapshot
            // listener error handling, nothing in :app references this type directly. GitLive
            // ships real Crashlytics coverage (recordException et al) — resolves part of GOALS.md
            // §18g's "no multiplatform Crashlytics exists yet" note, which predates this SDK
            // version; re-verify the rest of §18g against this when that item comes up.
            implementation(libs.gitlive.firebase.crashlytics)
            // Ktor Client (GOALS.md §18f) — replaces GenerativeAiService's HttpURLConnection
            // calls (JVM/Android-only) for the OpenAI/DeepSeek/Claude BYO-key providers.
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)
            // GOALS.md §18h: screens/ViewModels move here from :app. api, not implementation —
            // :app's screen call sites (until they move too) and any future iOS app entry point
            // both need these visible, not just :shared's own internals.
            api(compose.runtime)
            api(compose.foundation)
            api(compose.material3)
            api(compose.materialIconsExtended)
            api(compose.ui)
            // compose.components.resources deliberately NOT added: this app has no images/strings
            // worth migrating to Compose Resources yet (strings.xml is nearly empty, text is
            // inline Portuguese literals), and its resource-ID codegen breaks the Android dex
            // step on this exact machine — the generated class name embeds the project's own
            // folder path, which contains a space ("Personal APP"), and DEX rejects space
            // characters in class names. Revisit if real resource migration is ever needed
            // (rename the folder, or find a Compose Resources config that avoids path-derived
            // names) — not a blocker for §18h otherwise.
            // JetBrains' own multiplatform-published mirror, not androidx.lifecycle directly —
            // the raw androidx.lifecycle:lifecycle-viewmodel-compose has no iOS/Native variant
            // (confirmed: :shared:compileKotlinIosSimulatorArm64 failed dependency resolution
            // with it). Compose Multiplatform's own `ui` artifact depends on this same JetBrains
            // group transitively, so this is the actually-supported coordinate, not a workaround.
            api(libs.jetbrains.lifecycle.viewmodel.compose)
            api(libs.koin.compose.viewmodel)
            api(libs.jetbrains.navigation.compose)
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
            implementation(libs.androidx.datastore.core.okio)
            implementation(libs.ktor.client.okhttp)
            // Firebase AI Logic (GOALS.md §3) — Gemini calls, Android-only (see
            // AndroidGeminiProvider/GeminiProvider's doc). Replaces the deprecated
            // com.google.ai.client.generativeai SDK.
            implementation(libs.firebase.ai)
        }
        iosMain.dependencies {
            implementation(libs.sqldelight.native.driver)
            implementation(libs.androidx.datastore.core.okio)
            implementation(libs.ktor.client.darwin)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}

// GitLive's Android artifacts declare classic com.google.firebase:* transitive deps with no
// pinned version, same as using those artifacts directly — they need the BOM applied here too,
// not just in :app, or Gradle can't resolve a version for them. `platform()` inside
// kotlin.sourceSets.*.dependencies {} is deprecated for removal (KT-58759); the project-level
// dependencies {} block with the source-set-suffixed configuration name is the replacement.
dependencies {
    "androidMainImplementation"(platform(libs.firebase.bom))
}

// GOALS.md §18d: replaces Room 3.0 — Room's KSP processor hits a confirmed, reproducible
// upstream bug (github.com/google/ksp/issues/3053-adjacent: any @TypeConverters usage triggers
// a KSP [MissingType] failure in this exact Room 3.0.1 + KSP + AGP 9 KMP-library-plugin
// combination, isolated via direct testing — not fixable from this project). SQLDelight has
// mature, multi-year KMP support with no equivalent issue.
sqldelight {
    databases {
        create("AppDatabase") {
            packageName.set("com.example.personalapp.data.local")
        }
    }
}
