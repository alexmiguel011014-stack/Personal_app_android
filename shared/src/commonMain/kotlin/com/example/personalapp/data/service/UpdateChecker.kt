package com.example.personalapp.data.service

import com.example.personalapp.util.Platform
import com.example.personalapp.util.currentPlatform
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

// GOALS.md §18i: the manifest this app checks against, kept as a plain file at the repo root
// (not a GitHub Release asset) — no extra API/auth needed to read it, just a raw-content GET.
private const val MANIFEST_URL =
    "https://raw.githubusercontent.com/alexmiguel011014-stack/Personal_app_android/main/latest.json"

@Serializable
data class AndroidUpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val changelog: String,
    val downloadUrl: String,
)

@Serializable
data class IosUpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val changelog: String,
    // ISO-8601 instant, e.g. "2026-09-01T00:00:00Z" — set by whoever re-signs/uploads the iOS
    // build. null means "unknown", not "never expires" — SideStore-signed builds always expire.
    val signatureExpiresAt: String? = null,
)

@Serializable
private data class UpdateManifest(
    val android: AndroidUpdateInfo,
    val ios: IosUpdateInfo,
)

sealed class UpdateStatus {
    object UpToDate : UpdateStatus()
    data class UpdateAvailable(
        val versionName: String,
        val changelog: String,
        val downloadUrl: String,
    ) : UpdateStatus()
    // iOS-only: current install is fine, but its signature is running out (§18a's expiry risk).
    data class SignatureExpiring(val daysRemaining: Int) : UpdateStatus()
    data class CheckFailed(val message: String) : UpdateStatus()
}

class UpdateChecker(
    private val currentVersionCode: Int,
    val currentVersionName: String,
) {
    private val httpClient = HttpClient {
        expectSuccess = false
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        install(HttpTimeout) {
            requestTimeoutMillis = 10_000
            connectTimeoutMillis = 10_000
        }
    }

    @OptIn(ExperimentalTime::class)
    suspend fun check(): UpdateStatus {
        val manifest = try {
            val response = httpClient.get(MANIFEST_URL)
            if (!response.status.isSuccess()) {
                return UpdateStatus.CheckFailed("HTTP ${response.status.value}")
            }
            response.body<UpdateManifest>()
        } catch (e: Exception) {
            return UpdateStatus.CheckFailed(e.message ?: "Falha ao verificar atualização")
        }

        return when (currentPlatform()) {
            Platform.ANDROID -> {
                val info = manifest.android
                if (info.versionCode > currentVersionCode) {
                    UpdateStatus.UpdateAvailable(info.versionName, info.changelog, info.downloadUrl)
                } else {
                    UpdateStatus.UpToDate
                }
            }
            Platform.IOS -> {
                val info = manifest.ios
                if (info.versionCode > currentVersionCode) {
                    UpdateStatus.UpdateAvailable(info.versionName, info.changelog, "")
                } else {
                    val expiresAt = info.signatureExpiresAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
                    val daysRemaining = expiresAt?.let { (it - Clock.System.now()).inWholeDays.toInt() }
                    if (daysRemaining != null && daysRemaining <= 3) {
                        UpdateStatus.SignatureExpiring(daysRemaining.coerceAtLeast(0))
                    } else {
                        UpdateStatus.UpToDate
                    }
                }
            }
        }
    }
}
