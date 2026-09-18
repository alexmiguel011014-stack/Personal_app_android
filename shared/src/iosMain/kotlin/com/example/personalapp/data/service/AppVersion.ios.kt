package com.example.personalapp.data.service

import platform.Foundation.NSBundle

fun iosAppVersion(): AppVersion {
    val info = NSBundle.mainBundle.infoDictionary
    val code = (info?.get("CFBundleVersion") as? String)?.toIntOrNull() ?: 0
    val name = (info?.get("CFBundleShortVersionString") as? String) ?: "?"
    return AppVersion(code = code, name = name, platform = AppPlatform.IOS)
}
