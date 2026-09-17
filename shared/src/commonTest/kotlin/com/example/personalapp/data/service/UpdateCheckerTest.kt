package com.example.personalapp.data.service

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class UpdateCheckerTest {

    // Same shape as the repo's latest.json (GOALS.md §18i) — keep the two in step.
    private val manifest = """
        {
          "android": {
            "versionCode": 2,
            "versionName": "1.1",
            "changelog": "Correções.",
            "downloadUrl": "https://example.test/app-release.apk"
          },
          "ios": {
            "versionCode": 1,
            "versionName": "1.0",
            "changelog": "Versão inicial.",
            "signatureExpiresAt": null
          }
        }
    """.trimIndent()

    private fun checker(version: AppVersion, body: String = manifest, status: HttpStatusCode = HttpStatusCode.OK) =
        UpdateChecker(version, HttpClient(MockEngine { respond(body, status) }), manifestUrl = "https://example.test/latest.json")

    @Test
    fun `android build behind the manifest sees the update with its download url`() = runTest {
        val status = checker(AppVersion(1, "1.0", AppPlatform.ANDROID)).check()
        assertIs<UpdateStatus.UpdateAvailable>(status)
        assertEquals("1.1", status.versionName)
        assertEquals("https://example.test/app-release.apk", status.downloadUrl)
    }

    @Test
    fun `android build at the manifest version is up to date`() = runTest {
        assertEquals(UpdateStatus.UpToDate, checker(AppVersion(2, "1.1", AppPlatform.ANDROID)).check())
    }

    @Test
    fun `ios build at the manifest version with no expiry is up to date`() = runTest {
        assertEquals(UpdateStatus.UpToDate, checker(AppVersion(1, "1.0", AppPlatform.IOS)).check())
    }

    @Test
    fun `ios update has no download url`() = runTest {
        val status = checker(AppVersion(0, "0.9", AppPlatform.IOS)).check()
        assertIs<UpdateStatus.UpdateAvailable>(status)
        assertEquals(null, status.downloadUrl)
    }

    @Test
    fun `http failure is reported, not thrown`() = runTest {
        val status = checker(AppVersion(1, "1.0", AppPlatform.ANDROID), body = "", status = HttpStatusCode.NotFound).check()
        assertIs<UpdateStatus.Failed>(status)
    }

    @Test
    fun `malformed manifest is reported, not thrown`() = runTest {
        val status = checker(AppVersion(1, "1.0", AppPlatform.ANDROID), body = "{ nope").check()
        assertIs<UpdateStatus.Failed>(status)
    }
}
