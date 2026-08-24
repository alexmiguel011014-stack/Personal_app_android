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
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.activity.compose)
    implementation(libs.kotlinx.serialization.json)

    // Koin (GOALS.md §18c — replaces Hilt, which has no Kotlin Multiplatform support)
    implementation(platform(libs.koin.bom))
    implementation(libs.koin.android)
    implementation(libs.koin.androidx.compose)

    // Lifecycle
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.appcheck.debug)
    // Firebase AI Logic (GOALS.md §3) — replaces the deprecated com.google.ai.client.generativeai
    // SDK for Gemini calls; free on the Spark plan via the Gemini Developer API backend.
    implementation(libs.firebase.ai)
    implementation(libs.kotlinx.coroutines.play.services)

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