package com.example.personalapp.data.service

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.daysUntil
import kotlinx.datetime.todayIn
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Clock

enum class AppPlatform { ANDROID, IOS }

// The running build's identity, supplied by the platform Koin module (Android: PackageManager;
// iOS: the main bundle's Info.plist).
data class AppVersion(val code: Int, val name: String, val platform: AppPlatform)

sealed class UpdateStatus {
    data object UpToDate : UpdateStatus()
    data class UpdateAvailable(
        val versionName: String,
        val changelog: String,
        // Android: the .apk to download. iOS: null — SideStore refreshes from its source instead.
        val downloadUrl: String?,
    ) : UpdateStatus()
    // iOS only: the sideloaded signature's remaining validity, when the manifest states it.
    data class SignatureExpiring(val daysLeft: Int) : UpdateStatus()
    data class Failed(val message: String) : UpdateStatus()
}

@Serializable
private data class UpdateManifest(val android: AndroidRelease, val ios: IosRelease)

@Serializable
private data class AndroidRelease(
    val versionCode: Int,
    val versionName: String,
    val changelog: String = "",
    val downloadUrl: String,
)

@Serializable
private data class IosRelease(
    val versionCode: Int,
    val versionName: String,
    val changelog: String = "",
    // ISO date (YYYY-MM-DD) of when the currently distributed signature stops working, or null.
    val signatureExpiresAt: String? = null,
)

/**
 * GOALS.md §18i: compares the running build against `latest.json` on this repo's `main` branch —
 * the repo is public, so the raw file is a free, zero-backend update manifest. Edit that file
 * (and attach the .apk to a GitHub Release) to announce a version; nothing else to deploy.
 */
class UpdateChecker(
    private val appVersion: AppVersion,
    private val httpClient: HttpClient,
    private val manifestUrl: String = DEFAULT_MANIFEST_URL,
) {
    private val json = Json { ignoreUnknownKeys = true }

    companion object {
        const val DEFAULT_MANIFEST_URL =
            "https://raw.githubusercontent.com/alexmiguel011014-stack/Personal_app_android/main/latest.json"
        // Warn this many days before an iOS signature lapses (free Apple IDs sign for 7 days).
        const val SIGNATURE_WARNING_DAYS = 3
    }

    suspend fun check(): UpdateStatus = try {
        val response = httpClient.get(manifestUrl)
        if (!response.status.isSuccess()) {
            UpdateStatus.Failed("Não foi possível consultar atualizações (${response.status.value}).")
        } else {
            evaluate(json.decodeFromString(UpdateManifest.serializer(), response.bodyAsText()))
        }
    } catch (e: Exception) {
        UpdateStatus.Failed("Não foi possível consultar atualizações: ${e.message}")
    }

    private fun evaluate(manifest: UpdateManifest): UpdateStatus = when (appVersion.platform) {
        AppPlatform.ANDROID -> {
            val release = manifest.android
            if (release.versionCode > appVersion.code) {
                UpdateStatus.UpdateAvailable(release.versionName, release.changelog, release.downloadUrl)
            } else {
                UpdateStatus.UpToDate
            }
        }
        AppPlatform.IOS -> {
            val release = manifest.ios
            val daysLeft = release.signatureExpiresAt?.let { daysUntil(it) }
            when {
                release.versionCode > appVersion.code ->
                    UpdateStatus.UpdateAvailable(release.versionName, release.changelog, downloadUrl = null)
                daysLeft != null && daysLeft <= SIGNATURE_WARNING_DAYS -> UpdateStatus.SignatureExpiring(daysLeft)
                else -> UpdateStatus.UpToDate
            }
        }
    }

    private fun daysUntil(isoDate: String): Int? = runCatching {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        today.daysUntil(LocalDate.parse(isoDate))
    }.getOrNull()
}
