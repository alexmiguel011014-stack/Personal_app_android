package com.example.personalapp.ui.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlinx.browser.window

private class WebPlatformActions : PlatformActions {
    // Web Share API (mobile browsers, mostly) when available; clipboard copy otherwise. Raw
    // `js()` here, not typed kotlinx-browser bindings — Navigator.share/clipboard aren't part of
    // the standard external declarations this library ships.
    override fun shareText(text: String) {
        js("if (navigator.share) { navigator.share({ text: text }); } else if (navigator.clipboard) { navigator.clipboard.writeText(text); }")
    }

    override fun openUrl(url: String) {
        window.open(url, "_blank")
    }
}

@Composable
actual fun rememberPlatformActions(): PlatformActions = remember { WebPlatformActions() }
