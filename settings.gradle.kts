import java.net.URI

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // GOALS.md §19f/§19g fix (2026-09-14): Kotlin/JS's own Node.js auto-download needs this
        // exact repository, and FAIL_ON_PROJECT_REPOS rejects it when Kotlin tries to add it
        // itself at evaluation time. §19f worked around this locally with
        // NodeJsEnvSpec.download = false, but that turned out to be incomplete — it silently
        // didn't cover :shared:jsBrowserProductionWebpack, which reproduced the identical
        // failure on a clean GitHub Actions ubuntu-latest runner (confirmed via a real CI run,
        // not assumed to be a local-only quirk as first recorded). This is the actual fix,
        // copied verbatim from Kotlin's own integration test for exactly this scenario
        // (nodejs-setup-with-user-repositories/settings.gradle.kts, kotlin/kotlin@v2.3.20) —
        // register the repository Kotlin needs instead of trying to stop every task from
        // wanting it.
        ivy {
            name = "Distributions at https://nodejs.org/dist"
            url = URI("https://nodejs.org/dist")
            patternLayout {
                artifact("v[revision]/[artifact](-v[revision]-[classifier]).[ext]")
            }
            metadataSources { artifact() }
            content { includeModule("org.nodejs", "node") }
        }
    }
}

rootProject.name = "Personal APP"
include(":app")
include(":shared")
