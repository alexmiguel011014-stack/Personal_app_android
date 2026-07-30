package com.example.personalapp.di

import android.content.Context
import com.example.personalapp.data.local.AppDatabase
import com.example.personalapp.data.local.dao.AppDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return AppDatabase.getDatabase(context)
    }

    @Provides
    fun provideAppDao(database: AppDatabase): AppDao {
        return database.appDao()
    }
}
