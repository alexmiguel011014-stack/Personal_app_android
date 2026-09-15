package com.example.personalapp.util

actual fun currentTimeMillis(): Long = kotlin.js.Date().getTime().toLong()
