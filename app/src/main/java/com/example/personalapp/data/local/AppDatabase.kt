package com.example.personalapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.*

val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE workouts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'")
        db.execSQL("ALTER TABLE workouts ADD COLUMN assignedAt INTEGER")
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `workout_logs` (
                `id` TEXT NOT NULL,
                `studentId` TEXT NOT NULL,
                `workoutId` TEXT NOT NULL,
                `exerciseName` TEXT NOT NULL,
                `date` INTEGER NOT NULL,
                `performedSetsJson` TEXT NOT NULL,
                `note` TEXT,
                PRIMARY KEY(`id`)
            )
            """.trimIndent()
        )
    }
}

@Database(
    entities = [
        UserEntity::class,
        BiometricEntity::class,
        WorkoutEntity::class,
        HistoryEntity::class,
        ScheduleEntity::class,
        WorkoutLogEntity::class,
    ],
    version = 6,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {

    abstract fun appDao(): AppDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "personal_app_database"
                )
                    .addMigrations(MIGRATION_5_6)
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
