package com.filelenspro.app.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "files",
    indices = [
        Index(value = ["uri"], unique = true),
        Index(value = ["isCard"]),
        Index(value = ["extension"])
    ]
)
data class FileEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val uri: String,
    val name: String,
    val extension: String = "",
    val fileType: String = "file",
    val size: Long = 0,
    val modified: String = "",
    val contentText: String? = null,
    val ocrText: String? = null,
    val ocrStatus: String = "skipped", // "done" | "pending" | "failed" | "skipped"
    val indexDate: String = "",
    val isCard: Boolean = false,
    val customTag: String = "",
    val pageCount: Int = 1,
    val isScanned: Boolean = false,
    val sha256: String = ""
)

@Entity(
    tableName = "file_chunks",
    foreignKeys = [
        ForeignKey(
            entity = FileEntity::class,
            parentColumns = ["id"],
            childColumns = ["fileId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["fileId"])]
)
data class FileChunkEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val fileId: Long,
    val chunkIndex: Int,
    val chunkText: String,
    val pageNumber: Int = 1,
    val embeddingBytes: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is FileChunkEntity) return false
        return id == other.id && fileId == other.fileId && chunkIndex == other.chunkIndex
    }

    override fun hashCode(): Int = id.hashCode() * 31 + fileId.hashCode()
}

@Entity(
    tableName = "voice_notes",
    indices = [
        Index(value = ["uri"], unique = true),
        Index(value = ["temporalClass", "resolvedDatetime"]),
        Index(value = ["fileId"])
    ]
)
data class VoiceNoteEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val fileId: Long = 0,
    val uri: String,
    val title: String = "",
    val rawTranscript: String,
    val temporalClass: String = "historical", // "today" | "future" | "historical"
    val resolvedDatetime: String? = null,
    val actionItemsJson: String = "[]",
    val isReminderSet: Boolean = false,
    val imageUrisJson: String = "[]",
    val linkedDocUri: String = "",
    val linkedDocName: String = "",
    val linkedDocType: String = "",
    val createdAt: String
)

@Entity(
    tableName = "bookmarks",
    indices = [Index(value = ["fileUri"], unique = true)]
)
data class BookmarkEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val fileUri: String,
    val fileName: String,
    val extension: String = "",
    val size: Long = 0,
    val modified: String = "",
    val tagsJson: String = "[]",
    val createdAt: String
)

@Entity(tableName = "saved_searches")
data class SavedSearchEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val query: String,
    val mode: String = "partial",
    val createdAt: String
)

@Entity(
    tableName = "index_targets",
    indices = [Index(value = ["uri"], unique = true)]
)
data class IndexTargetEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val uri: String,
    val label: String,
    val type: String = "folder",
    val addedAt: String
)
