package com.example.personalapp.data.service

import com.example.personalapp.resources.Res

// The two bundled Markdown files behind AI ficha generation (GOALS.md §5d, §15b), read through
// Compose Multiplatform's resource system so Android and iOS ship them the same way. Each is read
// once per process (this is a Koin single) — they never change at runtime.
class PromptAssets {
    private var volumeReference: String? = null
    private var fichaPromptTemplate: String? = null

    suspend fun volumeReference(): String =
        volumeReference ?: read("files/hypertrophy_volume_reference.md").also { volumeReference = it }

    suspend fun fichaPromptTemplate(): String =
        fichaPromptTemplate ?: read("files/ficha_prompt_template.md").also { fichaPromptTemplate = it }

    private suspend fun read(path: String): String = Res.readBytes(path).decodeToString()
}
