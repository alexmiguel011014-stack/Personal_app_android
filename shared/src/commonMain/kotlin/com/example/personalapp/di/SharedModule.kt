package com.example.personalapp.di

import com.example.personalapp.data.local.AppDatabase
import com.example.personalapp.data.repository.AuthRepository
import com.example.personalapp.data.repository.SettingsRepository
import com.example.personalapp.data.repository.StudentRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.service.GenerativeAiService
import com.example.personalapp.data.service.PromptAssets
import com.example.personalapp.ui.viewmodel.AIWorkoutViewModel
import com.example.personalapp.ui.viewmodel.AdminViewModel
import com.example.personalapp.ui.viewmodel.AuthViewModel
import com.example.personalapp.ui.viewmodel.PromptFichaViewModel
import com.example.personalapp.ui.viewmodel.SettingsViewModel
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel
import com.example.personalapp.ui.viewmodel.StudentViewModel
import com.example.personalapp.ui.viewmodel.TrainerViewModel
import com.example.personalapp.ui.viewmodel.WorkoutViewModel
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.auth.FirebaseAuth
import dev.gitlive.firebase.auth.auth
import dev.gitlive.firebase.firestore.FirebaseFirestore
import dev.gitlive.firebase.firestore.firestore
import org.koin.core.module.Module
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

// GOALS.md §18c/§18h: the one DI graph both platforms share. Everything that needs a platform
// file location (Room database, DataStore) comes from [platformModule] instead — start Koin with
// both: `startKoin { modules(platformModule, sharedModule) }`.
val sharedModule: Module = module {
    single<FirebaseAuth> { Firebase.auth }
    single<FirebaseFirestore> { Firebase.firestore }
    single { get<AppDatabase>().appDao() }

    single { AuthRepository(get(), get()) }
    single { SettingsRepository(get()) }
    single { TrainerRepository(get(), get(), get()) }
    single { StudentRepository(get(), get()) }
    single { PromptAssets() }
    single { GenerativeAiService(get(), get()) }

    viewModel { AIWorkoutViewModel(get(), get()) }
    viewModel { AdminViewModel(get(), get()) }
    viewModel { AuthViewModel(get(), get()) }
    viewModel { PromptFichaViewModel(get(), get()) }
    viewModel { SettingsViewModel(get()) }
    viewModel { StudentDetailsViewModel(get()) }
    viewModel { StudentViewModel(get()) }
    viewModel { TrainerViewModel(get()) }
    viewModel { WorkoutViewModel(get()) }
}

// Provides AppDatabase and DataStore<Preferences> for the current platform.
expect val platformModule: Module
