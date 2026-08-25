package com.example.personalapp.ui.platform

import androidx.compose.runtime.Composable

// GOALS.md §18h: the only genuinely platform-specific UI actions in this app — everything else
// composes unchanged in commonMain. Android: Intent.ACTION_SEND / ACTION_VIEW. iOS:
// UIActivityViewController / UIApplication.openURL.
interface PlatformActions {
    fun shareText(text: String)
    fun openUrl(url: String)
}

@Composable
expect fun rememberPlatformActions(): PlatformActions
