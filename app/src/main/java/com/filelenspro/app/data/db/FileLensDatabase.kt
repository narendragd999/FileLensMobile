package com.filelenspro.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        FileEntity::class,
        FileChunkEntity::class,
        VoiceNoteEntity::class,
        BookmarkEntity::class,
        SavedSearchEntity::class,
        IndexTargetEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class FileLensDatabase : RoomDatabase() {
    abstract fun dao(): FileLensDao

    companion object {
        @Volatile
        private var INSTANCE: FileLensDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE voice_notes ADD COLUMN recurrenceRule TEXT NOT NULL DEFAULT 'none'"
                )
            }
        }

        fun getInstance(context: Context): FileLensDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    FileLensDatabase::class.java,
                    "filelens_pro.db"
                )
                    .addMigrations(MIGRATION_1_2)
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
