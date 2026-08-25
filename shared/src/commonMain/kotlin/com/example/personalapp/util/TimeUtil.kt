package com.example.personalapp.util

// GOALS.md §18f: replaces the many `System.currentTimeMillis()` call sites that moved from
// app/androidMain into commonMain repositories — JVM-only, no multiplatform equivalent in the
// stdlib (kotlin.system.getTimeMillis() is Native-only and deprecated besides).
expect fun currentTimeMillis(): Long
