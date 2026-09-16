package com.example.personalapp.di

import com.example.personalapp.data.local.AppDatabase
import com.example.personalapp.data.local.createDataStore
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
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.firestore
import dev.gitlive.firebase.auth.auth
import dev.gitlive.firebase.firestore.firestore
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module
import dev.gitlive.firebase.Firebase as GitLiveFirebase
import dev.gitlive.firebase.auth.FirebaseAuth as GitLiveFirebaseAuth
import dev.gitlive.firebase.firestore.FirebaseFirestore as GitLiveFirebaseFirestore

// GOALS.md §18c: replaces AuthModule/DatabaseModule (Dagger/Hilt) — Hilt has no Kotlin
// Multiplatform support, Koin does. Every provider here is a straight port of the old
// @Provides/@Inject wiring, same singleton shape, no behavior change.
val appModule = module {
    // GOALS.md §18f: the repositories (now in :shared) use the GitLive KMP wrappers; on Android
    // these delegate to the same default FirebaseApp the official SDK below uses, so both are the
    // one Firestore instance. The official type stays registered only for AdminViewModel, which
    // is ADM-only/Android-only and untouched by the KMP migration so far.
    single<GitLiveFirebaseAuth> { GitLiveFirebase.auth }
    single<GitLiveFirebaseFirestore> { GitLiveFirebase.firestore }
    single<FirebaseFirestore> { Firebase.firestore }
    single { getRoomDatabase(getDatabaseBuilder(androidContext())) }
    single { get<AppDatabase>().appDao() }

    single { AuthRepository(get(), get()) }
    single { createDataStore(androidContext()) }
    single { SettingsRepository(get()) }
    single { TrainerRepository(get(), get(), get()) }
    single { StudentRepository(get(), get()) }
    single {
        GenerativeAiService(
            settingsRepository = get(),
            volumeReference = androidContext().assets.open("hypertrophy_volume_reference.md")
                .bufferedReader().use { it.readText() },
        )
    }

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
