package com.example.personalapp.util

import com.example.personalapp.util.externals.ReCaptchaEnterpriseProvider
import com.example.personalapp.util.externals.getApp
import com.example.personalapp.util.externals.initializeAppCheck
import kotlin.js.json

// reCAPTCHA Enterprise site key for the "Personal Tracker Web" app (google cloud console,
// Security → reCAPTCHA Enterprise → personal-tracker-web key, domain localhost) — registered in
// Firebase App Check 2026-09-13.
private const val RECAPTCHA_ENTERPRISE_SITE_KEY = "6Lcdc7ktAAAAAPEISgB2tBDOr1jH-tGj2Plk0yt2"

// Must run once, before any other Firebase call (Auth/Firestore) — App Check attaches its token
// to every subsequent request. Called from §19f's web entry point, not from here.
fun initWebAppCheck(siteKey: String = RECAPTCHA_ENTERPRISE_SITE_KEY) {
    val provider = ReCaptchaEnterpriseProvider(siteKey)
    val options = json(
        "provider" to provider,
        "isTokenAutoRefreshEnabled" to true,
    )
    initializeAppCheck(getApp(), options)
}
