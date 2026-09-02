package com.example.personalapp.di

import com.example.personalapp.data.local.DatabaseDriverFactory
import com.example.personalapp.data.local.createDataStore
import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.repository.AuthRepository
import com.example.personalapp.data.repository.SettingsRepository
import com.example.personalapp.data.repository.StudentRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.service.GeminiProvider
import com.example.personalapp.data.service.GenerativeAiService
import com.example.personalapp.data.service.IosGeminiProvider
import com.example.personalapp.data.service.UpdateChecker
import com.example.personalapp.ui.viewmodel.AIWorkoutViewModel
import com.example.personalapp.ui.viewmodel.AdminViewModel
import com.example.personalapp.ui.viewmodel.AuthViewModel
import com.example.personalapp.ui.viewmodel.PromptFichaViewModel
import com.example.personalapp.ui.viewmodel.SettingsViewModel
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel
import com.example.personalapp.ui.viewmodel.StudentViewModel
import com.example.personalapp.ui.viewmodel.TrainerViewModel
import com.example.personalapp.ui.viewmodel.UpdateViewModel
import com.example.personalapp.ui.viewmodel.WorkoutViewModel
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.auth.FirebaseAuth
import dev.gitlive.firebase.auth.auth
import dev.gitlive.firebase.firestore.FirebaseFirestore
import dev.gitlive.firebase.firestore.firestore
import kotlinx.cinterop.ExperimentalForeignApi
import okio.FileSystem
import okio.Path.Companion.toPath
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module
import platform.Foundation.NSBundle

// iOS counterpart to :app/di/AppModule.kt — kept as a separate file (not shared code) for the
// same reason that one stays in :app: the platform-specific bits (reading bundled resource
// files, the app's own version) need a platform API with no cross-platform equivalent wired up
// yet (see GenerativeAiService's doc). Some duplication of the plain viewModel{}/single{}
// registrations against :app's module is the accepted cost of that split, not an oversight.
@OptIn(ExperimentalForeignApi::class)
private fun readBundledResource(name: String): String {
    val path = NSBundle.mainBundle.pathForResource(name, "md")
        ?: error("Bundled resource not found in app bundle: $name.md")
    return FileSystem.SYSTEM.read(path.toPath()) { readUtf8() }
}

private fun currentAppVersion(): Pair<Int, String> {
    val info = NSBundle.mainBundle.infoDictionary
    val versionCode = (info?.get("CFBundleVersion") as? String)?.toIntOrNull() ?: 0
    val versionName = info?.get("CFBundleShortVersionString") as? String ?: "?"
    return versionCode to versionName
}

val iosAppModule = module {
    single<FirebaseAuth> { Firebase.auth }
    single<FirebaseFirestore> { Firebase.firestore }
    single { DatabaseDriverFactory() }
    single { AppDao(get()) }
    single { createDataStore() }

    single { AuthRepository(get(), get()) }
    single { SettingsRepository(get()) }
    single { TrainerRepository(get(), get(), get()) }
    single { StudentRepository(get(), get()) }
    single<GeminiProvider> { IosGeminiProvider() }
    single { GenerativeAiService(get(), readBundledResource("hypertrophy_volume_reference"), get()) }
    single(qualifier = org.koin.core.qualifier.named("fichaTemplate")) {
        val template = readBundledResource("ficha_prompt_template")
        val table = readBundledResource("hypertrophy_volume_reference")
        template.replace("\$TABLE_PLACEHOLDER\$", table)
    }
    single {
        val (code, name) = currentAppVersion()
        UpdateChecker(currentVersionCode = code, currentVersionName = name)
    }

    viewModel { AuthViewModel(get(), get(), get()) }
    viewModel { WorkoutViewModel(get()) }
    viewModel { AIWorkoutViewModel(get(), get()) }
    viewModel { TrainerViewModel(get()) }
    viewModel { SettingsViewModel(get()) }
    viewModel { StudentViewModel(get()) }
    viewModel { StudentDetailsViewModel(get()) }
    viewModel { PromptFichaViewModel(get(), get(qualifier = org.koin.core.qualifier.named("fichaTemplate"))) }
    viewModel { AdminViewModel(get(), get()) }
    viewModel { UpdateViewModel(get()) }
}
