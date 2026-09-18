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
    // JVM 17 (was 11) to match :shared — see the note in shared/build.gradle.kts (GOALS.md §18f).
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
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

    // GOALS.md §18h: every screen, ViewModel and the navigation graph live in :shared (Compose
    // Multiplatform, exposed as `api`). :app only needs the Activity entry point.
    implementation(libs.androidx.activity.compose)

    // Koin (GOALS.md §18c): startKoin/androidContext in MainApplication; modules are in :shared.
    implementation(platform(libs.koin.bom))
    implementation(libs.koin.android)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.appcheck.debug)
    // Firebase AI Logic (Gemini) now lives in :shared's androidMain (GOALS.md §18f).
    implementation(libs.kotlinx.coroutines.play.services)

    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.mockk.android)
    // Pinned to the Jetpack Compose version Compose Multiplatform 1.11.0 is based on (no
    // multiplatform port of the UI-test artifacts exists).
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.test.manifest)
}

// GOALS.md §9/§18m: one command for every check that doesn't need a device — :app unit tests +
// lint, :shared's commonTest suite on the JVM, and *compilation* of both instrumented test sets
// (they went stale unnoticed once, §18h). Running them (connectedAndroidTest,
// :shared:connectedAndroidDeviceTest) stays a separate, emulator-only stage.
tasks.register("verify") {
    group = "verification"
    description = "Unit tests + lint (:app), shared JVM tests, and instrumented-test compilation — everything that runs without a device."
    dependsOn(
        "testDebugUnitTest",
        "lint",
        "compileDebugAndroidTestKotlin",
        ":shared:testAndroidHostTest",
        ":shared:compileAndroidDeviceTest",
    )
}