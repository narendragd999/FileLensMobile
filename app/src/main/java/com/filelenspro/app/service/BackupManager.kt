package com.filelenspro.app.service

import com.filelenspro.app.data.db.BookmarkEntity
import com.filelenspro.app.data.db.FileLensDao
import com.filelenspro.app.data.db.SavedSearchEntity
import com.filelenspro.app.data.db.VoiceNoteEntity
import com.filelenspro.app.data.model.BackupBookmark
import com.filelenspro.app.data.model.BackupCardTag
import com.filelenspro.app.data.model.BackupPayload
import com.filelenspro.app.data.model.BackupSavedSearch
import com.filelenspro.app.data.model.BackupSignatureEntry
import com.filelenspro.app.data.model.BackupVoiceNote
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

data class BackupStats(
    val voiceNotes: Int,
    val bookmarks: Int,
    val savedSearches: Int,
    val cardTags: Int,
    val signatures: Int
)

object BackupManager {

    private val MAGIC = byteArrayOf('F'.code.toByte(), 'S'.code.toByte(), 'P'.code.toByte(), 'B'.code.toByte())
    private const val SALT_LEN = 16
    private const val IV_LEN = 12
    private const val PBKDF2_ITERATIONS = 100_000
    private const val KEY_BITS = 256
    private const val GCM_TAG_BITS = 128

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun encryptBytes(plainBytes: ByteArray, password: String): ByteArray {
        require(password.length >= 4) { "Password must be at least 4 characters." }
        val rng = SecureRandom()
        val salt = ByteArray(SALT_LEN).also { rng.nextBytes(it) }
        val iv = ByteArray(IV_LEN).also { rng.nextBytes(it) }
        val key = deriveAesKey(password, salt)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        val cipherBytes = cipher.doFinal(plainBytes)

        return ByteArrayOutputStream(MAGIC.size + SALT_LEN + IV_LEN + cipherBytes.size).apply {
            write(MAGIC)
            write(salt)
            write(iv)
            write(cipherBytes)
        }.toByteArray()
    }

    fun decryptBytes(encryptedBytes: ByteArray, password: String): ByteArray {
        val minHeader = MAGIC.size + SALT_LEN + IV_LEN + 16
        require(encryptedBytes.size >= minHeader) { "Backup file is corrupted or incomplete." }
        for (i in MAGIC.indices) {
            require(encryptedBytes[i] == MAGIC[i]) { "Not a valid FileSearchPro backup archive." }
        }
        val salt = encryptedBytes.copyOfRange(MAGIC.size, MAGIC.size + SALT_LEN)
        val iv = encryptedBytes.copyOfRange(MAGIC.size + SALT_LEN, MAGIC.size + SALT_LEN + IV_LEN)
        val cipherBytes = encryptedBytes.copyOfRange(MAGIC.size + SALT_LEN + IV_LEN, encryptedBytes.size)
        val key = deriveAesKey(password, salt)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher.doFinal(cipherBytes)
    }

    private fun deriveAesKey(password: String, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(password.toCharArray(), salt, PBKDF2_ITERATIONS, KEY_BITS)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val raw = factory.generateSecret(spec).encoded
        return SecretKeySpec(raw, "AES")
    }

    suspend fun exportEncryptedBackup(
        outputStream: OutputStream,
        password: String,
        dao: FileLensDao,
        signaturesDir: File
    ): BackupStats = withContext(Dispatchers.IO) {
        val notes = dao.getAllVoiceNotes().map {
            BackupVoiceNote(
                uri = it.uri,
                title = it.title,
                rawTranscript = it.rawTranscript,
                temporalClass = it.temporalClass,
                resolvedDatetime = it.resolvedDatetime,
                actionItemsJson = it.actionItemsJson,
                isReminderSet = it.isReminderSet,
                imageUrisJson = it.imageUrisJson,
                linkedDocUri = it.linkedDocUri,
                linkedDocName = it.linkedDocName,
                linkedDocType = it.linkedDocType,
                createdAt = it.createdAt,
                recurrenceRule = it.recurrenceRule
            )
        }
        val bookmarks = dao.getAllBookmarks().map {
            BackupBookmark(
                fileUri = it.fileUri,
                fileName = it.fileName,
                extension = it.extension,
                size = it.size,
                modified = it.modified,
                tagsJson = it.tagsJson,
                createdAt = it.createdAt
            )
        }
        val searches = dao.getAllSavedSearches().map {
            BackupSavedSearch(query = it.query, mode = it.mode, createdAt = it.createdAt)
        }
        val cardTags = dao.getAllCards().map {
            BackupCardTag(fileUri = it.uri, isCard = it.isCard, customTag = it.customTag)
        }
        val sigs = (signaturesDir.listFiles() ?: emptyArray())
            .filter { it.isFile && it.extension.equals("png", true) && it.length() in 1L..2_000_000L }
            .map { f ->
                BackupSignatureEntry(
                    fileName = f.name,
                    pngBase64 = Base64.getEncoder().encodeToString(f.readBytes())
                )
            }

        val payload = BackupPayload(
            formatVersion = 1,
            exportedAtIso = Instant.now().toString(),
            voiceNotes = notes,
            bookmarks = bookmarks,
            savedSearches = searches,
            cardTags = cardTags,
            signatures = sigs
        )
        val plain = json.encodeToString(payload).toByteArray(Charsets.UTF_8)
        val encrypted = encryptBytes(plain, password)
        outputStream.use { it.write(encrypted) }

        BackupStats(
            voiceNotes = notes.size,
            bookmarks = bookmarks.size,
            savedSearches = searches.size,
            cardTags = cardTags.size,
            signatures = sigs.size
        )
    }

    suspend fun importEncryptedBackup(
        inputStream: InputStream,
        password: String,
        dao: FileLensDao,
        signaturesDir: File
    ): BackupStats = withContext(Dispatchers.IO) {
        val raw = inputStream.use { it.readBytes() }
        val plain = decryptBytes(raw, password)
        val payload = json.decodeFromString<BackupPayload>(plain.toString(Charsets.UTF_8))

        payload.voiceNotes.forEach { n ->
            dao.insertVoiceNote(
                VoiceNoteEntity(
                    uri = n.uri,
                    title = n.title,
                    rawTranscript = n.rawTranscript,
                    temporalClass = n.temporalClass,
                    resolvedDatetime = n.resolvedDatetime,
                    actionItemsJson = n.actionItemsJson,
                    isReminderSet = n.isReminderSet,
                    imageUrisJson = n.imageUrisJson,
                    linkedDocUri = n.linkedDocUri,
                    linkedDocName = n.linkedDocName,
                    linkedDocType = n.linkedDocType,
                    createdAt = n.createdAt,
                    recurrenceRule = n.recurrenceRule
                )
            )
        }
        payload.bookmarks.forEach { b ->
            dao.insertBookmark(
                BookmarkEntity(
                    fileUri = b.fileUri,
                    fileName = b.fileName,
                    extension = b.extension,
                    size = b.size,
                    modified = b.modified,
                    tagsJson = b.tagsJson,
                    createdAt = b.createdAt
                )
            )
        }
        payload.savedSearches.forEach { s ->
            dao.insertSavedSearch(
                SavedSearchEntity(query = s.query, mode = s.mode, createdAt = s.createdAt)
            )
        }
        var appliedTags = 0
        payload.cardTags.forEach { ct ->
            val existing = dao.getFileByUri(ct.fileUri)
            if (existing != null) {
                dao.updateCardTag(existing.id, ct.isCard, ct.customTag)
                appliedTags++
            }
        }
        signaturesDir.mkdirs()
        var restoredSigs = 0
        payload.signatures.forEach { sig ->
            val safeName = File(sig.fileName).name
            if (safeName.endsWith(".png", ignoreCase = true)) {
                runCatching {
                    val bytes = Base64.getDecoder().decode(sig.pngBase64)
                    File(signaturesDir, safeName).writeBytes(bytes)
                    restoredSigs++
                }
            }
        }

        BackupStats(
            voiceNotes = payload.voiceNotes.size,
            bookmarks = payload.bookmarks.size,
            savedSearches = payload.savedSearches.size,
            cardTags = appliedTags,
            signatures = restoredSigs
        )
    }
}
