package com.example.personalapp

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIViewController

// GOALS.md §18j: first real iOS app shell entry point — deliberately a standalone placeholder,
// not RoleRouter (that needs Koin + Firebase.initialize() wired up for iOS first, which this
// milestone doesn't do; see iOSApp.swift's comment). Proves the pipeline end to end: Xcode
// project -> links Shared.framework -> Compose Multiplatform actually renders on a real iOS
// simulator, not just "the Kotlin/Native compile succeeds."
fun MainViewController(): UIViewController = ComposeUIViewController {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Personal Tracker — iOS shell ok")
            }
        }
    }
}
