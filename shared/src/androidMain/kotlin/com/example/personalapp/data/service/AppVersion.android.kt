package com.example.personalapp.data.service

import android.content.Context
import android.os.Build

fun androidAppVersion(context: Context): AppVersion {
    @Suppress("DEPRECATION")
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    @Suppress("DEPRECATION")
    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode.toInt() else info.versionCode
    return AppVersion(code = code, name = info.versionName ?: "?", platform = AppPlatform.ANDROID)
}
