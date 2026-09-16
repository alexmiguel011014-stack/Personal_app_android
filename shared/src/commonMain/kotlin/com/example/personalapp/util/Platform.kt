package com.example.personalapp.util

import kotlin.time.Clock
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

// commonMain stand-ins for System.currentTimeMillis() / java.util.UUID (both JVM-only). Same
// epoch-millis and canonical lowercase-hyphenated UUID text the JVM calls produced, so values
// written by either side stay interchangeable in Firestore/Room.
fun nowMillis(): Long = Clock.System.now().toEpochMilliseconds()

@OptIn(ExperimentalUuidApi::class)
fun randomUuidString(): String = Uuid.random().toString()
