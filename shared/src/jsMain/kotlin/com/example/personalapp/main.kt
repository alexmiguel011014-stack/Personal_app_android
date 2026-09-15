package com.example.personalapp

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.ComposeViewport
import com.example.personalapp.di.webAppModule
import com.example.personalapp.ui.navigation.RoleRouter
import com.example.personalapp.util.initWebAppCheck
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.FirebaseOptions
import dev.gitlive.firebase.initialize
import kotlinx.browser.document
import org.koin.core.context.startKoin

// GOALS.md §19f: web counterpart to :app/MainActivity.kt + MainApplication.kt — same
// MaterialTheme/Surface/RoleRouter wrapping, same "Koin + App Check before anything else" order.
// There is no google-services.json/GoogleService-Info.plist equivalent for `js` — this call is
// the only place this configuration exists for the web build. Real values from the "Personal
// Tracker" web app registered in the Firebase console 2026-09-13 (Project settings → Your apps).
// No `measurementId`/Analytics — this app doesn't use Firebase Analytics anywhere else either.
private val webFirebaseOptions = FirebaseOptions(
    applicationId = "1:681428046020:web:f8fec8862ed8e00bbb3991",
    apiKey = "AIzaSyC8Jeqq2CzMWEU5Do3Tsrbe6hB75u7CZo0",
    projectId = "personalapp-88129",
    storageBucket = "personalapp-88129.firebasestorage.app",
    gcmSenderId = "681428046020",
    authDomain = "personalapp-88129.firebaseapp.com",
)

@OptIn(ExperimentalComposeUiApi::class)
fun main() {
    Firebase.initialize(context = null, options = webFirebaseOptions)
    // GOALS.md §19e/§19g: App Check before Koin/Compose, same order as Android's
    // MainApplication. Safe to run first now that Compose mounts on #app, not <body> — the
    // reCAPTCHA placeholder <div> App Check appends to <body> is a sibling Compose never
    // touches. The old post-mount double-requestAnimationFrame ordering only held on localhost;
    // on the real GitHub Pages deploy the wasm load was slow enough that Compose's async
    // container reset still wiped the div after both frames had fired (confirmed live, every
    // reload).
    initWebAppCheck()
    startKoin { modules(webAppModule) }
    ComposeViewport(document.getElementById("app")!!) {
        MaterialTheme {
            // GOALS.md §20c: §19f clamped this to a centered 480dp column so the phone-shaped UI
            // wouldn't stretch edge to edge on desktop. That clamp is gone — it would cap the
            // viewport below §20's 840dp breakpoint and stop the dashboard layout ever engaging.
            // Width is now handled inside the layout itself (MainScreen's compact/expanded
            // branches), which is shared with Android instead of being a web-only override.
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background
            ) {
                RoleRouter()
            }
        }
    }
}
