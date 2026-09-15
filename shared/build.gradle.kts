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

// GOALS.md §19f/§19g: the equivalent root build.gradle.kts hook alone didn't stop
// :shared:jsBrowserProductionWebpack from hitting the same "repository added by unknown code"
// failure — NodeJsPlugin's actual instance backing the js target's own tasks may be scoped to
// this project, not the root one. Applied here too, matching Kotlin's own integration test
// fixture, which configures this in the same build file as the js target itself.
project.plugins.withType<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsPlugin> {
    project.the<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsEnvSpec>().downloadBaseUrl.set(null as String?)
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

    // GOALS.md §19a/§19b: the web target. Plain `js`, not `wasmJs` — GitLive's Firebase SDK
    // (§18f, the app's Auth/Firestore layer) only publishes a `js` variant, and Compose
    // Multiplatform's `js`/canvas renderer no longer needs the old
    // `org.jetbrains.compose.experimental.jscanvas.enabled` flag, confirming it's a first-class
    // target, not an experimental fallback. `wasmJs` is documented as a later migration (§19a),
    // not built now.
    js {
        // GOALS.md §19f: the root project name ("Personal APP") has a space, which is invalid
        // in an npm package name — Kotlin/JS derives one from the Gradle project name/path by
        // default ("Personal APP-shared"), and `kotlinNpmInstall` rejects it
        // (`EINVALIDPACKAGENAME`, confirmed via a real failed build, not guessed). This is the
        // exact same root cause `compose.components.resources` was already left out for
        // (`shared/build.gradle.kts`'s existing comment on the Android dex step) — `moduleName`
        // overrides it for this target specifically, without renaming the whole Gradle project.
        outputModuleName.set("personal-app-shared")
        browser()
        // Needed once a real `main()` entry point exists (this module now has one,
        // shared/src/jsMain/kotlin/.../main.kt) — without this, the js target only produces a
        // library klib, no runnable browser distribution/task.
        binaries.executable()
    }

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
            // androidx.datastore moved out of commonMain (GOALS.md §19b) — datastore-core/
            // datastore-preferences-core publish no `js` target variant (only `wasmJs`), so
            // declaring them here (even as api) would break dependency resolution for the web
            // target. SettingsStore's expect/actual (data/local/SettingsStore.kt) is the
            // abstraction commonMain depends on instead; only the android/iOS actuals still
            // reference androidx.datastore types directly.
            // GitLive Kotlin Firebase SDK (GOALS.md §18f) — Google ships no official Firebase KMP
            // SDK, this is the established community alternative. :app's AppModule.kt/AdminViewModel
            // reference FirebaseAuth/FirebaseFirestore directly, hence api not implementation.
            api(libs.gitlive.firebase.auth)
            api(libs.gitlive.firebase.firestore)
            // dev.gitlive:firebase-crashlytics moved out of commonMain (GOALS.md §19b) — it
            // publishes no `js` variant (confirmed via a real dependency-resolution failure,
            // unlike firebase-auth/firebase-firestore above, which do). util/CrashReporter.kt's
            // expect/actual is what commonMain calls instead; only the android/iOS actuals still
            // depend on this artifact directly.
            // Ktor Client (GOALS.md §18f) — replaces GenerativeAiService's HttpURLConnection
            // calls (JVM/Android-only) for the OpenAI/DeepSeek/Claude BYO-key providers. No
            // ContentNegotiation/serialization-kotlinx-json plugin (GOALS.md §19b) — neither
            // publishes a `js` variant (only `wasmJs`); GenerativeAiService/UpdateChecker
            // (de)serialize by hand with plain kotlinx.serialization instead.
            implementation(libs.ktor.client.core)
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
            implementation(libs.androidx.datastore.core)
            implementation(libs.androidx.datastore.preferences.core)
            implementation(libs.androidx.datastore.core.okio)
            implementation(libs.gitlive.firebase.crashlytics)
            implementation(libs.ktor.client.okhttp)
            // Firebase AI Logic (GOALS.md §3) — Gemini calls, Android-only (see
            // AndroidGeminiProvider/GeminiProvider's doc). Replaces the deprecated
            // com.google.ai.client.generativeai SDK.
            implementation(libs.firebase.ai)
        }
        iosMain.dependencies {
            implementation(libs.sqldelight.native.driver)
            implementation(libs.androidx.datastore.core)
            implementation(libs.androidx.datastore.preferences.core)
            implementation(libs.androidx.datastore.core.okio)
            implementation(libs.gitlive.firebase.crashlytics)
            implementation(libs.ktor.client.darwin)
        }
        jsMain.dependencies {
            // GOALS.md §19b/§19d: web's HTTP engine (GenerativeAiService/UpdateChecker) and
            // browser bindings (SettingsStore/PlatformActions' localStorage/window/navigator
            // access) — see each file's doc for why datastore/content-negotiation aren't here.
            implementation(libs.ktor.client.js)
            implementation(libs.kotlinx.browser)
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
