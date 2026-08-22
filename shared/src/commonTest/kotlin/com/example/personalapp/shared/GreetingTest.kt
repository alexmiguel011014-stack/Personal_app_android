package com.example.personalapp.shared

import kotlin.test.Test
import kotlin.test.assertEquals

class GreetingTest {
    @Test
    fun sharedModulePlatformName_returnsExpectedValue() {
        assertEquals("Personal Tracker shared module", sharedModulePlatformName())
    }
}
