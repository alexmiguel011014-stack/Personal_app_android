package com.example.personalapp.ui.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.Foundation.NSURL
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication

private class IosPlatformActions : PlatformActions {
    override fun shareText(text: String) {
        val controller = UIActivityViewController(activityItems = listOf(text), applicationActivities = null)
        UIApplication.sharedApplication.keyWindow?.rootViewController
            ?.presentViewController(controller, animated = true, completion = null)
    }

    override fun openUrl(url: String) {
        val nsUrl = NSURL.URLWithString(url) ?: return
        UIApplication.sharedApplication.openURL(nsUrl)
    }
}

@Composable
actual fun rememberPlatformActions(): PlatformActions = remember { IosPlatformActions() }
