import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.googleServices)
    alias(libs.plugins.firebaseCrashlytics)
}

// Release signing (GOALS.md §11): keystore path + passwords live only in the gitignored
// local.properties, never in this file or in CI config directly. A clone without those entries
// (a fresh dev machine, CI without the secret) just gets an unsigned release build — assembleDebug
// and the verify task are unaffected either way.
val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        load(FileInputStream(localPropertiesFile))
    }
}
val releaseStoreFilePath: String? = localProperties.getProperty("RELEASE_STORE_FILE")

android {
    namespace = "com.example.personalapp"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.example.personalapp"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (releaseStoreFilePath != null) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFilePath)
                storePassword = localProperties.getProperty("RELEASE_STORE_PASSWORD")
                keyAlias = localProperties.getProperty("RELEASE_KEY_ALIAS")
                keyPassword = localProperties.getProperty("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            optimization {
                enable = true
            }
            if (releaseStoreFilePath != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    compileOptions {
        // Bumped from 11 → 17 for GOALS.md §18f: the GitLive Firebase SDK's Android artifacts
        // ship inline reified functions compiled at JVM target 17 — inlining them into an 11
        // target fails at compile time, not just a version-alignment nicety.
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
    packaging {
        resources {
            // mockk-android pulls in JUnit Jupiter transitively, which ships duplicate META-INF
            // license/notice files that collide with the rest of the androidTest classpath —
            // only surfaces when actually building the androidTest APK (connectedAndroidTest),
            // which is why this went unnoticed until a real device made that runnable.
            excludes += setOf(
                "META-INF/LICENSE.md",
                "META-INF/LICENSE-notice.md",
                "META-INF/NOTICE.md",
                "META-INF/LICENSE.txt",
                "META-INF/NOTICE.txt",
                "META-INF/DEPENDENCIES",
            )
        }
    }
}

dependencies {
    // GOALS.md §18h: screens/ViewModels/navigation all moved into :shared/commonMain, which
    // exposes Compose Multiplatform (runtime/foundation/material3/materialIconsExtended/ui),
    // Koin Compose (koin-compose-viewmodel), the JetBrains multiplatform navigation-compose, and
    // JetBrains' multiplatform lifecycle-viewmodel-compose as `api` dependencies — all of that
    // now flows to :app transitively instead of needing its own (and possibly
    // version-conflicting) classic androidx.compose.*/androidx.navigation.* copies. What's left
    // here is genuinely Android-only: the Activity host itself and Android-only DI wiring.
    implementation(project(":shared"))
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    implementation(libs.androidx.activity.compose)
    implementation(libs.kotlinx.serialization.json)

    // Koin (GOALS.md §18c — replaces Hilt, which has no Kotlin Multiplatform support)
    implementation(platform(libs.koin.bom))
    implementation(libs.koin.android)

    // Firebase App Check — GitLive doesn't cover this at all (GOALS.md §18f/§18g), stays
    // Android-only here.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.appcheck.debug)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.mockk.android)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.test.manifest)
}

// GOALS.md §9: one command for the checks that don't need a device (see §11 for why
// connectedAndroidTest is deliberately excluded — it's a separate CI/local stage, emulator-only).
tasks.register("verify") {
    group = "verification"
    description = "Runs unit tests and lint together (excludes connectedAndroidTest, which needs a device/emulator)."
    dependsOn("testDebugUnitTest", "lint")
}