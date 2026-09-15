package com.example.personalapp.util

enum class Platform { ANDROID, IOS, WEB }

expect fun currentPlatform(): Platform
