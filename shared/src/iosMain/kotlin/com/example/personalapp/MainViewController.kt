package com.example.personalapp

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.ComposeUIViewController
import com.example.personalapp.ui.navigation.RoleRouter
import platform.UIKit.UIViewController

// GOALS.md §18j: real entry point now that Koin (AppModule.ios.kt's initKoin(), called once from
// iOSApp.swift's init) and Firebase (via GitLive, same dev.gitlive.firebase.Firebase.auth/
// firestore accessors :app's AppModule.kt uses on Android) are wired up for iOS. Mirrors
// MainActivity.kt's Surface { RoleRouter() } exactly — same shared Composable, same navigation
// graph, no iOS-specific screen code.
fun MainViewController(): UIViewController = ComposeUIViewController {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            RoleRouter()
        }
    }
}
