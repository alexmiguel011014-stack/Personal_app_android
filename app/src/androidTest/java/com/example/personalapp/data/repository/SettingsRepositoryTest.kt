package com.example.personalapp.data.repository

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.personalapp.data.local.createDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * §18e: confirms the DataStore Multiplatform round-trip (OkioStorage on Android) actually
 * persists and reads back through SettingsRepository on a real device/emulator filesystem.
 */
@RunWith(AndroidJUnit4::class)
class SettingsRepositoryTest {

    @Test
    fun apiKeysRoundTripThroughDataStore() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = SettingsRepository(createDataStore(context))

        repository.saveOpenaiApiKey("test-openai-key")
        repository.saveDeepseekApiKey("test-deepseek-key")
        repository.saveClaudeApiKey("test-claude-key")

        assertEquals("test-openai-key", repository.openaiApiKey.first())
        assertEquals("test-deepseek-key", repository.deepseekApiKey.first())
        assertEquals("test-claude-key", repository.claudeApiKey.first())
    }
}
