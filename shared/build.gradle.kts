import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// GOALS.md §18b: the shared KMP module. Starts empty on purpose — this is the toolchain
// checkpoint (Android compiles locally, iOS compiles via CI's macOS runner, see
// .github/workflows/ios-ci.yml) that has to be green before any real business logic moves in.
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
    // Compose Multiplatform / compose-compiler intentionally NOT applied yet — no Compose code
    // lives in :shared until §18h. Add both back then, together with the compose.* dependencies.
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
        compilations.configureEach {
            compileTaskProvider.configure {
                compilerOptions {
                    jvmTarget.set(JvmTarget.JVM_11)
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
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}

dependencies {
    add("kspAndroid", libs.androidx.room3.compiler)
    add("kspIosSimulatorArm64", libs.androidx.room3.compiler)
    add("kspIosArm64", libs.androidx.room3.compiler)
}
