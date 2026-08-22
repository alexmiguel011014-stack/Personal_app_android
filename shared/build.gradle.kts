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
                    jvmTarget.set(JvmTarget.JVM_11)
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
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
        }
        iosMain.dependencies {
            implementation(libs.sqldelight.native.driver)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
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
