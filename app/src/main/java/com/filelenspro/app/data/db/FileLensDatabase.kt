package com.filelenspro.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        FileEntity::class,
        FileChunkEntity::class,
        VoiceNoteEntity::class,
        BookmarkEntity::class,
        SavedSearchEntity::class,
        IndexTargetEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class FileLensDatabase : RoomDatabase() {
    abstract fun dao(): FileLensDao

    companion object {
        @Volatile
        private var INSTANCE: FileLensDatabase? = null

        fun getInstance(context: Context): FileLensDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    FileLensDatabase::class.java,
                    "filelens_pro.db"
                )
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
