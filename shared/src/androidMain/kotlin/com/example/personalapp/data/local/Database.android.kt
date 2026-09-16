package com.example.personalapp.data.local

import android.content.Context
import androidx.room3.Room
import androidx.room3.RoomDatabase

// Preserves the exact on-disk file location of every already-installed app's database: passing a
// bare name to Room's classic 2.x builder resolved internally to context.getDatabasePath(name),
// so resolving it explicitly here and passing the absolute path keeps existing installs pointed
// at the same file (required for MIGRATION_5_6/6_7 to find real data, not an empty new database).
fun getDatabaseBuilder(context: Context): RoomDatabase.Builder<AppDatabase> {
    val appContext = context.applicationContext
    val dbFile = appContext.getDatabasePath(DATABASE_FILE_NAME)
    return Room.databaseBuilder<AppDatabase>(
        context = appContext,
        name = dbFile.absolutePath
    )
}
