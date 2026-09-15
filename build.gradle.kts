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

// GOALS.md §19f: Kotlin/JS's own Node.js auto-download needs an Ivy repository
// (nodejs.org/dist) it adds itself at project-evaluation time — this repo's
// `dependencyResolutionManagement { repositoriesMode = FAIL_ON_PROJECT_REPOS }` (settings.gradle.kts)
// rejects any repo not declared centrally there, so that auto-add fails the build. Simpler than
// registering the ivy repo centrally: use the Node.js already installed on this machine instead
// of downloading Kotlin's own copy — sidesteps the repository policy entirely.
project.plugins.withType<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsPlugin> {
    project.the<org.jetbrains.kotlin.gradle.targets.js.nodejs.NodeJsEnvSpec>().download = false
}
