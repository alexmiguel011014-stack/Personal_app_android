package com.example.personalapp.util

import kotlin.math.round

// GOALS.md §18h: replaces "%.1f".format(value), which needs java.util.Formatter — JVM-only, not
// available on Kotlin/Native. Assumes a non-negative value, the only case this app formats.
fun formatDecimal1(value: Double): String {
    val rounded = round(value * 10).toLong()
    return "${rounded / 10}.${rounded % 10}"
}
