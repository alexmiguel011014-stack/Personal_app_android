package com.example.personalapp.data.local

import kotlinx.browser.localStorage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

// GOALS.md §19b/§19c: DataStore Multiplatform has no `js` target (only `wasmJs`), so the web
// build backs settings with plain browser localStorage instead. Single-tab scope only — a value
// changed in another tab of the same browser won't push an update here (localStorage's own
// `storage` event only fires for *other* tabs, not the one that wrote it) — acceptable for a
// viability test, revisit if this ever needs real multi-tab sync.
actual class SettingsStore {
    private val stringFlows = mutableMapOf<String, MutableStateFlow<String>>()
    private val booleanFlows = mutableMapOf<String, MutableStateFlow<Boolean>>()

    actual fun observeString(key: String): Flow<String> =
        stringFlows.getOrPut(key) { MutableStateFlow(localStorage.getItem(key) ?: "") }

    actual fun observeBoolean(key: String): Flow<Boolean> =
        booleanFlows.getOrPut(key) { MutableStateFlow(localStorage.getItem(key)?.toBoolean() ?: false) }

    actual suspend fun setString(key: String, value: String) {
        localStorage.setItem(key, value)
        stringFlows.getOrPut(key) { MutableStateFlow(value) }.value = value
    }

    actual suspend fun setBoolean(key: String, value: Boolean) {
        localStorage.setItem(key, value.toString())
        booleanFlows.getOrPut(key) { MutableStateFlow(value) }.value = value
    }
}
