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
    // Compose Multiplatform / compose-compiler intentionally NOT applied yet — no Compose code
    // lives in :shared until §18h. Add both back then, together with the compose.* dependencies.
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
            implementation(libs.kotlinx.serialization.json)
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
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
            implementation(libs.androidx.datastore.core.okio)
        }
        iosMain.dependencies {
            implementation(libs.sqldelight.native.driver)
            implementation(libs.androidx.datastore.core.okio)
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
