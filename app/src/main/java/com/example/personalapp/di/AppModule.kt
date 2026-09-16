package com.example.personalapp.di

import com.example.personalapp.data.local.AppDatabase
import com.example.personalapp.data.local.getDatabaseBuilder
import com.example.personalapp.data.local.getRoomDatabase
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

// GOALS.md §18c: replaces AuthModule/DatabaseModule (Dagger/Hilt) — Hilt has no Kotlin
// Multiplatform support, Koin does. Every provider here is a straight port of the old
// @Provides/@Inject wiring, same singleton shape, no behavior change.
val appModule = module {
    single<FirebaseAuth> { Firebase.auth }
    single<FirebaseFirestore> { Firebase.firestore }
    single { getRoomDatabase(getDatabaseBuilder(androidContext())) }
    single { get<AppDatabase>().appDao() }

    single { AuthRepository(get(), get()) }
    single { SettingsRepository(androidContext()) }
    single { TrainerRepository(get(), get(), get()) }
    single { StudentRepository(get(), get()) }
    single { GenerativeAiService(get(), androidContext()) }

    viewModel { AIWorkoutViewModel(get(), get()) }
    viewModel { AdminViewModel(get(), get()) }
    viewModel { AuthViewModel(get(), get()) }
    viewModel { PromptFichaViewModel(get(), androidContext()) }
    viewModel { SettingsViewModel(get()) }
    viewModel { StudentDetailsViewModel(get()) }
    viewModel { StudentViewModel(get()) }
    viewModel { TrainerViewModel(get()) }
    viewModel { WorkoutViewModel(get()) }
}
