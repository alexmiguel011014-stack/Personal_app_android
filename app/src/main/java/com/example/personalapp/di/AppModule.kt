package com.example.personalapp.di

import com.example.personalapp.data.local.AppDatabase
import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.repository.AuthRepository
import com.example.personalapp.data.repository.SettingsRepository
import com.example.personalapp.data.repository.StudentRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.service.GenerativeAiService
import com.example.personalapp.ui.viewmodel.AIWorkoutViewModel
import com.example.personalapp.ui.viewmodel.AdminViewModel
import com.example.personalapp.ui.viewmodel.AuthViewModel
import com.example.personalapp.ui.viewmodel.PromptFichaViewModel
import com.example.personalapp.ui.viewmodel.SettingsViewModel
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel
import com.example.personalapp.ui.viewmodel.StudentViewModel
import com.example.personalapp.ui.viewmodel.TrainerViewModel
import com.example.personalapp.ui.viewmodel.WorkoutViewModel
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.firestore
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

// GOALS.md §18c: replaces the old AuthModule.kt/DatabaseModule.kt (Hilt @Module/@Provides) —
// Hilt has no Kotlin Multiplatform support at all, Koin does. One module for the whole app
// graph for now; split by feature only if this grows unwieldy, not speculatively.
val appModule = module {
    single<FirebaseAuth> { Firebase.auth }
    single<FirebaseFirestore> { Firebase.firestore }
    single { AppDatabase.getDatabase(androidContext()) }
    single<AppDao> { get<AppDatabase>().appDao() }

    single { AuthRepository(get(), get()) }
    single { SettingsRepository(androidContext()) }
    single { TrainerRepository(get(), get(), get()) }
    single { StudentRepository(get(), get()) }
    single { GenerativeAiService(get(), androidContext()) }

    viewModel { AuthViewModel(get(), get()) }
    viewModel { WorkoutViewModel(get()) }
    viewModel { AIWorkoutViewModel(get(), get()) }
    viewModel { TrainerViewModel(get()) }
    viewModel { SettingsViewModel(get()) }
    viewModel { StudentViewModel(get()) }
    viewModel { StudentDetailsViewModel(get()) }
    viewModel { PromptFichaViewModel(get(), androidContext()) }
    viewModel { AdminViewModel(get(), get()) }
}
