package com.example.personalapp.util

enum class Platform { ANDROID, IOS }

expect fun currentPlatform(): Platform
