package com.example.personalapp.data.local

import androidx.room3.ColumnTypeConverters
import androidx.room3.ConstructedBy
import androidx.room3.Database
import androidx.room3.RoomDatabase
import androidx.room3.RoomDatabaseConstructor
import androidx.room3.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.*
import kotlinx.coroutines.Dispatchers

val MIGRATION_5_6 = object : Migration(5, 6) {
    override suspend fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE workouts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'")
        connection.execSQL("ALTER TABLE workouts ADD COLUMN assignedAt INTEGER")
        connection.execSQL(
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

val MIGRATION_6_7 = object : Migration(6, 7) {
    override suspend fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE users ADD COLUMN linked INTEGER NOT NULL DEFAULT 0")
    }
}

// GOALS.md §17b: trainer-granted permission flags on users + the assessments history table.
// The CREATE TABLE below is copied from the exported schema (shared/schemas/.../8.json) so Room's
// post-migration validation sees exactly what it expects.
val MIGRATION_7_8 = object : Migration(7, 8) {
    override suspend fun migrate(connection: SQLiteConnection) {
        connection.execSQL("ALTER TABLE users ADD COLUMN canSelfAssess INTEGER NOT NULL DEFAULT 0")
        connection.execSQL("ALTER TABLE users ADD COLUMN canLogBiometrics INTEGER NOT NULL DEFAULT 0")
        connection.execSQL("ALTER TABLE users ADD COLUMN pendingAssessmentRequest INTEGER NOT NULL DEFAULT 0")
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `assessments` (`id` TEXT NOT NULL, `studentId` TEXT NOT NULL, " +
                "`trainerId` TEXT NOT NULL, `submittedAt` INTEGER NOT NULL, `parQAnswersJson` TEXT NOT NULL, " +
                "`goal` TEXT NOT NULL, `experienceLevel` TEXT NOT NULL, `trainingDays` TEXT NOT NULL, " +
                "PRIMARY KEY(`id`))"
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
        AssessmentEntity::class,
    ],
    version = 8,
    exportSchema = true
)
@ColumnTypeConverters(Converters::class)
@ConstructedBy(AppDatabaseConstructor::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun appDao(): AppDao
}

// The Room compiler generates the `actual` implementations for each platform.
@Suppress("KotlinNoActualForExpect")
expect object AppDatabaseConstructor : RoomDatabaseConstructor<AppDatabase> {
    override fun initialize(): AppDatabase
}

const val DATABASE_FILE_NAME = "personal_app_database"

// Same builder for every platform: only the file location differs (see Database.android.kt /
// Database.ios.kt), so it's supplied already-constructed. fallbackToDestructiveMigration is kept
// as a safety net for anything without an explicit migration path — see the two Migration objects
// above for what's actually expected to run on every real upgrade.
fun getRoomDatabase(builder: RoomDatabase.Builder<AppDatabase>): AppDatabase {
    return builder
        .addMigrations(MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8)
        .fallbackToDestructiveMigration(dropAllTables = true)
        .setDriver(BundledSQLiteDriver())
        .setQueryCoroutineContext(Dispatchers.IO)
        .build()
}
