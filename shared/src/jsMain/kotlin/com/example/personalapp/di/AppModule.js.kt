package com.example.personalapp.di

import com.example.personalapp.data.repository.AuthRepository
import com.example.personalapp.data.repository.FirestoreTrainerRepository
import com.example.personalapp.data.repository.SettingsRepository
import com.example.personalapp.data.repository.StudentRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.local.SettingsStore
import com.example.personalapp.data.service.GeminiProvider
import com.example.personalapp.data.service.GenerativeAiService
import com.example.personalapp.data.service.UpdateChecker
import com.example.personalapp.data.service.WebGeminiProvider
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
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

// GOALS.md §19d: web counterpart to :app/di/AppModule.kt / :shared/iosMain/di/AppModule.ios.kt —
// no DatabaseDriverFactory/AppDao (§19c: web reads Firestore directly, no SQLDelight cache), so
// TrainerRepository binds to FirestoreTrainerRepository instead of SqlDelightTrainerRepository.
//
// Known gap, not silently dropped: `volumeReference`/`fichaTemplate` (bundled
// hypertrophy_volume_reference.md/ficha_prompt_template.md, read from Android assets/iOS NSBundle
// on the other platforms) have no web equivalent wired yet — passed as an empty string for now,
// so AI generation still works, just without the extra grounding table on web. Follow-up: serve
// these as static files alongside the deployed JS bundle and fetch them at startup.
val webAppModule = module {
    single<FirebaseAuth> { Firebase.auth }
    single<FirebaseFirestore> { Firebase.firestore }
    single { SettingsStore() }

    single { AuthRepository(get(), get()) }
    single { SettingsRepository(get()) }
    single<TrainerRepository> { FirestoreTrainerRepository(get(), get()) }
    single { StudentRepository(get(), get()) }
    single<GeminiProvider> { WebGeminiProvider() }
    single { GenerativeAiService(get(), "", get()) }
    single(qualifier = org.koin.core.qualifier.named("fichaTemplate")) { "" }
    single { UpdateChecker(currentVersionCode = 0, currentVersionName = "web") }

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
