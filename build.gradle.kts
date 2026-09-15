// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.kotlin.multiplatform.library) apply false
    alias(libs.plugins.sqldelight) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.compose.compiler) apply false
    alias(libs.plugins.compose.multiplatform) apply false
    alias(libs.plugins.googleServices) apply false
    alias(libs.plugins.firebaseCrashlytics) apply false
}

// GOALS.md §19f/§19g: the real fix for Kotlin/JS's Node.js download vs. this repo's
// FAIL_ON_PROJECT_REPOS policy is two parts, both required — confirmed against Kotlin's own
// integration test for exactly this scenario (nodejs-setup-with-user-repositories,
// kotlin/kotlin@v2.3.20), not the single-part `download = false` §19f originally shipped, which
// only partially worked (:shared:jsBrowserProductionWebpack still failed identically in CI).
// Part 1 is the ivy repository declared centrally in settings.gradle.kts. Part 2 is this:
// setting `download = false` alone does NOT stop the plugin from also trying to register its
// own project-level repo — only clearing `downloadBaseUrl` does, since that's the value the
// plugin builds its ad-hoc repo *from*. Without this, Gradle sees two attempts to add an
// identically-named repository and FAIL_ON_PROJECT_REPOS rejects the second (the plugin's own),
// regardless of the central one already existing.
project.plugins.withType<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsPlugin> {
    project.the<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsEnvSpec>().downloadBaseUrl.set(null as String?)
}
