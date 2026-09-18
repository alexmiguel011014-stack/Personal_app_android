package com.example.personalapp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.example.personalapp.ui.navigation.RoleRouter

// The whole UI, platform-agnostic (GOALS.md §18h). Android's MainActivity and iOS's
// MainViewController both just host this; Koin must already be started (see di/).
@Composable
fun App() {
    MaterialTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                UpdateBanner()
                Column(modifier = Modifier.weight(1f)) {
                    RoleRouter()
                }
            }
        }
    }
}
