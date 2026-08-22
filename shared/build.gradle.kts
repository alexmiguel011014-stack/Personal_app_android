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
    // Compose Multiplatform / compose-compiler intentionally NOT applied yet — no Compose code
    // lives in :shared until §18h. Add both back then, together with the compose.* dependencies.
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

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }

    sourceSets {
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
