package com.filelenspro.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface FileLensDao {

    // ─── Files ───
    @Query("SELECT * FROM files ORDER BY id DESC")
    fun observeAllFiles(): Flow<List<FileEntity>>

    @Query("SELECT * FROM files ORDER BY id DESC")
    suspend fun getAllFiles(): List<FileEntity>

    @Query("SELECT * FROM files WHERE LOWER(extension) = 'pdf' OR isScanned = 1 ORDER BY id DESC")
    fun observePdfAndScannedDocuments(): Flow<List<FileEntity>>

    @Query("SELECT * FROM files WHERE isCard = 1 ORDER BY id DESC")
    fun observeCards(): Flow<List<FileEntity>>

    @Query("SELECT * FROM files WHERE isCard = 1 ORDER BY id DESC")
    suspend fun getAllCards(): List<FileEntity>

    @Query("SELECT * FROM files WHERE id = :id LIMIT 1")
    suspend fun getFileById(id: Long): FileEntity?

    @Query("SELECT * FROM files WHERE uri = :uri LIMIT 1")
    suspend fun getFileByUri(uri: String): FileEntity?

    @Query("SELECT * FROM files WHERE ocrStatus = 'pending'")
    suspend fun getPendingOcrFiles(): List<FileEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFile(file: FileEntity): Long

    @Update
    suspend fun updateFile(file: FileEntity)

    @Query("UPDATE files SET ocrText = :ocrText, ocrStatus = :status WHERE id = :id")
    suspend fun updateOcrResult(id: Long, ocrText: String, status: String)

    @Query("UPDATE files SET name = :newName, uri = :newUri WHERE id = :id")
    suspend fun renameFileRecord(id: Long, newName: String, newUri: String)

    @Query("UPDATE files SET pageCount = :pageCount, size = :size, modified = :modified WHERE id = :id")
    suspend fun updateDocumentMetadata(id: Long, pageCount: Int, size: Long, modified: String)

    @Query("UPDATE files SET isCard = :isCard, customTag = :tag WHERE id = :id")
    suspend fun updateCardTag(id: Long, isCard: Boolean, tag: String)

    @Query("DELETE FROM files WHERE id = :id")
    suspend fun deleteFileById(id: Long)

    @Query("DELETE FROM files WHERE uri = :uri")
    suspend fun deleteFileByUri(uri: String)

    @Query("DELETE FROM files")
    suspend fun clearAllFiles()

    // ─── Chunks ───
    @Query("SELECT * FROM file_chunks")
    suspend fun getAllChunks(): List<FileChunkEntity>

    @Query("DELETE FROM file_chunks WHERE fileId = :fileId")
    suspend fun deleteChunksForFile(fileId: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChunks(chunks: List<FileChunkEntity>)

    // ─── Voice Notes (Second Brain) ───
    @Query("SELECT * FROM voice_notes ORDER BY COALESCE(resolvedDatetime, createdAt) ASC, id DESC")
    fun observeAllVoiceNotes(): Flow<List<VoiceNoteEntity>>

    @Query("SELECT * FROM voice_notes WHERE temporalClass = :temporalClass ORDER BY COALESCE(resolvedDatetime, createdAt) ASC, id DESC")
    fun observeVoiceNotesByTemporalClass(temporalClass: String): Flow<List<VoiceNoteEntity>>

    @Query("SELECT * FROM voice_notes WHERE temporalClass = :temporalClass ORDER BY COALESCE(resolvedDatetime, createdAt) ASC, id DESC")
    suspend fun getVoiceNotesByTemporalClass(temporalClass: String): List<VoiceNoteEntity>

    @Query("SELECT * FROM voice_notes ORDER BY id DESC")
    suspend fun getAllVoiceNotes(): List<VoiceNoteEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVoiceNote(note: VoiceNoteEntity): Long

    @Update
    suspend fun updateVoiceNote(note: VoiceNoteEntity)

    @Query("DELETE FROM voice_notes WHERE id = :id")
    suspend fun deleteVoiceNoteById(id: Long)

    // ─── Bookmarks ───
    @Query("SELECT * FROM bookmarks ORDER BY id DESC")
    fun observeBookmarks(): Flow<List<BookmarkEntity>>

    @Query("SELECT * FROM bookmarks WHERE fileUri = :uri LIMIT 1")
    suspend fun getBookmarkByUri(uri: String): BookmarkEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBookmark(bookmark: BookmarkEntity): Long

    @Query("UPDATE bookmarks SET tagsJson = :tagsJson WHERE fileUri = :fileUri")
    suspend fun updateBookmarkTags(fileUri: String, tagsJson: String)

    @Query("DELETE FROM bookmarks WHERE fileUri = :fileUri")
    suspend fun deleteBookmarkByUri(fileUri: String)

    // ─── Saved Searches ───
    @Query("SELECT * FROM saved_searches ORDER BY id DESC")
    fun observeSavedSearches(): Flow<List<SavedSearchEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSavedSearch(search: SavedSearchEntity): Long

    @Query("DELETE FROM saved_searches WHERE id = :id")
    suspend fun deleteSavedSearchById(id: Long)

    @Query("DELETE FROM saved_searches")
    suspend fun clearSavedSearches()

    // ─── Index Targets ───
    @Query("SELECT * FROM index_targets ORDER BY id DESC")
    fun observeIndexTargets(): Flow<List<IndexTargetEntity>>

    @Query("SELECT * FROM index_targets ORDER BY id DESC")
    suspend fun getIndexTargets(): List<IndexTargetEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIndexTarget(target: IndexTargetEntity): Long

    @Query("DELETE FROM index_targets WHERE id = :id")
    suspend fun deleteIndexTarget(id: Long)
}
