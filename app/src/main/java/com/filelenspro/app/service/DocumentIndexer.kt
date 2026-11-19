package com.filelenspro.app.service

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.core.net.toUri
import com.filelenspro.app.data.db.FileChunkEntity
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.db.FileLensDao
import com.filelenspro.app.data.db.IndexTargetEntity
import com.filelenspro.app.data.model.IndexProgress
import com.filelenspro.app.domain.engine.EmbeddingEngine
import com.filelenspro.app.domain.engine.SmartTaxonomy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.time.Instant
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger

class DocumentIndexer(
    private val context: Context,
    private val dao: FileLensDao,
    private val engine: OcrAndPdfEngine
) {
    private val _isIndexing = MutableStateFlow(false)
    val isIndexing: StateFlow<Boolean> = _isIndexing.asStateFlow()

    private val _progress = MutableStateFlow<IndexProgress?>(null)
    val progress: StateFlow<IndexProgress?> = _progress.asStateFlow()

    @Volatile
    private var currentJob: Job? = null

    fun cancel() {
        currentJob?.cancel()
        _isIndexing.value = false
        _progress.value = null
        FileLensBackgroundService.stop(context)
    }

    suspend fun indexPickedUris(
        uris: List<Uri>,
        ocrLanguage: String = "eng+hin",
        isCard: Boolean = false,
        customTag: String = "",
        isScanned: Boolean = false
    ): List<FileEntity> = withContext(Dispatchers.IO) {
        if (uris.isEmpty()) return@withContext emptyList()
        _isIndexing.value = true
        FileLensBackgroundService.start(context, "Indexing Documents", "Preparing ${uris.size} files...")

        val indexed = mutableListOf<FileEntity>()
        val completed = AtomicInteger(0)
        val semaphore = Semaphore(3)
        try {
            coroutineScope {
                val jobs = uris.map { uri ->
                    async {
                        semaphore.withPermit {
                            val name = resolveDisplayName(uri)
                            _progress.value = IndexProgress(completed.get(), uris.size, name)
                            val saved = indexSingleUri(uri, ocrLanguage, isCard, customTag, isScanned)
                            val doneCount = completed.incrementAndGet()
                            _progress.value = IndexProgress(doneCount, uris.size, name)
                            FileLensBackgroundService.update(
                                context,
                                "FileSearchPro Indexing",
                                "Processed $doneCount/${uris.size}: $name",
                                doneCount,
                                uris.size
                            )
                            saved
                        }
                    }
                }
                indexed.addAll(jobs.awaitAll().filterNotNull())
            }
        } catch (_: CancellationException) {
        } finally {
            _isIndexing.value = false
            _progress.value = null
            FileLensBackgroundService.stop(context)
        }
        indexed
    }

    suspend fun addSafFolderTarget(treeUri: Uri, ocrLanguage: String = "eng+hin"): Int = withContext(Dispatchers.IO) {
        try {
            context.contentResolver.takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        } catch (_: Exception) {}

        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val label = docId.substringAfterLast(':').substringAfterLast('/').ifBlank { "Folder" }
        dao.insertIndexTarget(
            IndexTargetEntity(
                uri = treeUri.toString(),
                label = label,
                type = "folder",
                addedAt = Instant.now().toString()
            )
        )
        syncAndReindexAll(ocrLanguage = ocrLanguage, forceReindex = false)
    }

    /**
     * Automatically discovers new or modified files across app vault folders
     * (`ScannedDocs`, `SmartCards`, `IndexedDocs`, `VoiceNotes`) and persisted SAF folders,
     * removes deleted vault entries, and incrementally indexes/re-indexes changed items.
     */
    suspend fun syncAndReindexAll(
        ocrLanguage: String = "eng+hin",
        forceReindex: Boolean = false
    ): Int = withContext(Dispatchers.IO) {
        if (_isIndexing.value) return@withContext 0
        _isIndexing.value = true
        var syncedCount = 0
        try {
            val existingByUri = dao.getAllFiles().associateBy { it.uri }

            // 1. Clean up missing local vault records
            existingByUri.values.forEach { entity ->
                if (entity.uri.startsWith("file://")) {
                    val local = com.filelenspro.app.util.FormatUtils.resolveLocalFile(entity.uri)
                    if (local == null || !local.exists()) {
                        dao.deleteFileById(entity.id)
                    }
                }
            }

            // 2. Collect local vault files
            val vaultFolders = listOf(
                Triple(File(context.filesDir, "ScannedDocs"), false, true),
                Triple(File(context.filesDir, "SmartCards"), true, true),
                Triple(File(context.filesDir, "IndexedDocs"), false, false),
                Triple(File(context.filesDir, "VoiceNotes"), false, false)
            )
            val localCandidates = mutableListOf<Triple<File, Boolean, Boolean>>()
            vaultFolders.forEach { (dir, isCard, isScanned) ->
                if (dir.exists()) {
                    dir.walkTopDown().filter { it.isFile && !it.name.startsWith(".") }.forEach { f ->
                        val uriStr = f.toUri().toString()
                        val existing = existingByUri[uriStr]
                        val needsIndex = forceReindex || existing == null ||
                            existing.size != f.length() ||
                            existing.ocrStatus == "pending"
                        if (needsIndex) {
                            localCandidates.add(Triple(f, isCard, isScanned))
                        }
                    }
                }
            }

            // 3. Collect new/modified files from persisted SAF folders
            val safUris = mutableListOf<Uri>()
            dao.getIndexTargets().forEach { target ->
                runCatching {
                    val treeUri = Uri.parse(target.uri)
                    collectSafDocumentUris(treeUri, DocumentsContract.getTreeDocumentId(treeUri), safUris, maxDepth = 4)
                }
            }
            val newSafUris = safUris.filter { uri ->
                val existing = existingByUri[uri.toString()]
                forceReindex || existing == null || existing.ocrStatus == "pending"
            }

            val total = localCandidates.size + newSafUris.size
            if (total > 0) {
                FileLensBackgroundService.start(context, "Auto-Syncing Index", "Scanning $total new or updated files...")
                val done = AtomicInteger(0)
                val semaphore = Semaphore(3)
                coroutineScope {
                    val localJobs = localCandidates.map { (file, isCard, isScanned) ->
                        async {
                            semaphore.withPermit {
                                val res = indexLocalFile(
                                    file = file,
                                    displayName = file.name,
                                    ocrLanguage = ocrLanguage,
                                    isCard = isCard,
                                    isScanned = isScanned
                                )
                                val d = done.incrementAndGet()
                                _progress.value = IndexProgress(d, total, file.name)
                                res != null
                            }
                        }
                    }
                    val safJobs = newSafUris.map { uri ->
                        async {
                            semaphore.withPermit {
                                val res = indexSingleUri(uri, ocrLanguage = ocrLanguage)
                                val d = done.incrementAndGet()
                                _progress.value = IndexProgress(d, total, resolveDisplayName(uri))
                                res != null
                            }
                        }
                    }
                    syncedCount = (localJobs + safJobs).awaitAll().count { it }
                }
            }
        } catch (_: Exception) {
        } finally {
            _isIndexing.value = false
            _progress.value = null
            FileLensBackgroundService.stop(context)
        }
        syncedCount
    }

    private fun collectSafDocumentUris(treeUri: Uri, parentDocId: String, out: MutableList<Uri>, maxDepth: Int, depth: Int = 0) {
        if (depth > maxDepth || out.size >= 400) return
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
            while (cursor.moveToNext() && out.size < 400) {
                val docId = cursor.getString(0) ?: continue
                val mime = cursor.getString(1) ?: ""
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    collectSafDocumentUris(treeUri, docId, out, maxDepth, depth + 1)
                } else {
                    out.add(DocumentsContract.buildDocumentUriUsingTree(treeUri, docId))
                }
            }
        }
    }

    suspend fun indexSingleUri(
        uri: Uri,
        ocrLanguage: String = "eng+hin",
        isCard: Boolean = false,
        customTag: String = "",
        isScanned: Boolean = false
    ): FileEntity? = withContext(Dispatchers.IO) {
        val displayName = resolveDisplayName(uri)
        val vaultDir = File(context.filesDir, if (isScanned) "ScannedDocs" else "IndexedDocs").apply { mkdirs() }

        val targetFile: File = if (uri.scheme == "file" && uri.path != null && File(uri.path!!).exists()) {
            File(uri.path!!)
        } else {
            val safeName = displayName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val dest = File(vaultDir, "${System.currentTimeMillis()}_$safeName")
            context.contentResolver.openInputStream(uri)?.use { ins ->
                FileOutputStream(dest).use { outs -> ins.copyTo(outs) }
            } ?: return@withContext null
            dest
        }

        indexLocalFile(
            file = targetFile,
            displayName = displayName,
            ocrLanguage = ocrLanguage,
            isCard = isCard,
            customTag = customTag,
            isScanned = isScanned
        )
    }

    suspend fun indexLocalFile(
        file: File,
        displayName: String = file.name,
        ocrLanguage: String = "eng+hin",
        isCard: Boolean = false,
        customTag: String = "",
        isScanned: Boolean = false
    ): FileEntity? = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext null
        val ext = displayName.substringAfterLast('.', file.extension).lowercase(Locale.ROOT)
        val fileUri = file.toUri().toString()
        val sha256 = computeSha256(file)

        var contentText: String? = null
        var ocrText: String? = null
        var ocrStatus = "skipped"
        var pageCount = 1

        when (ext) {
            "pdf" -> {
                val (text, pages) = engine.extractPdfTextAndPageCount(fileUri, ocrLanguage)
                pageCount = pages
                if (text.isNotBlank()) {
                    contentText = text
                    ocrText = text
                    ocrStatus = "done"
                } else {
                    ocrStatus = "pending"
                }
            }
            "jpg", "jpeg", "png", "webp", "bmp" -> {
                val extracted = engine.extractTextFromImage(fileUri, ocrLanguage)
                ocrText = extracted
                ocrStatus = "done"
            }
            "txt", "md", "csv", "json", "xml", "log", "html" -> {
                contentText = runCatching { file.readText().take(250_000) }.getOrNull()
                ocrStatus = "done"
            }
            else -> {
                contentText = runCatching {
                    val sample = file.readText()
                    if (sample.count { it.code < 9 } == 0) sample.take(80_000) else null
                }.getOrNull()
                ocrStatus = if (contentText != null) "done" else "skipped"
            }
        }

        val existing = dao.getFileByUri(fileUri)
        val resolvedTag = customTag.ifBlank {
            existing?.customTag?.takeIf { it.isNotBlank() }
                ?: SmartTaxonomy.detectSmartTags(displayName, contentText, ocrText).firstOrNull().orEmpty()
        }

        val entity = FileEntity(
            id = existing?.id ?: 0,
            uri = fileUri,
            name = displayName,
            extension = ext,
            fileType = if (ext in setOf("jpg", "jpeg", "png", "webp")) "image" else if (ext == "pdf") "pdf" else "document",
            size = file.length(),
            modified = Instant.ofEpochMilli(file.lastModified()).toString(),
            contentText = contentText,
            ocrText = ocrText,
            ocrStatus = ocrStatus,
            indexDate = Instant.now().toString(),
            isCard = isCard || (existing?.isCard == true),
            customTag = resolvedTag,
            pageCount = pageCount,
            isScanned = isScanned || (existing?.isScanned == true),
            sha256 = sha256
        )

        val rowId = dao.insertFile(entity)
        val savedEntity = entity.copy(id = if (entity.id > 0) entity.id else rowId)
        rebuildEmbeddings(savedEntity)
        savedEntity
    }

    suspend fun rebuildEmbeddings(file: FileEntity) = withContext(Dispatchers.IO) {
        val fullText = listOfNotNull(file.name, file.customTag, file.contentText, file.ocrText)
            .filter { it.isNotBlank() }
            .joinToString("\n\n")
        if (fullText.isBlank()) return@withContext

        dao.deleteChunksForFile(file.id)
        val chunks = EmbeddingEngine.chunkText(fullText)
        val entities = chunks.mapIndexed { idx, (pageNum, slice) ->
            val vec = EmbeddingEngine.generateEmbedding(slice)
            FileChunkEntity(
                fileId = file.id,
                chunkIndex = idx,
                chunkText = slice,
                pageNumber = pageNum,
                embeddingBytes = EmbeddingEngine.toByteArray(vec)
            )
        }
        if (entities.isNotEmpty()) {
            dao.insertChunks(entities)
        }
    }

    suspend fun rerunPendingOcr(ocrLanguage: String = "eng+hin"): Int = withContext(Dispatchers.IO) {
        val pending = dao.getPendingOcrFiles()
        var processed = 0
        pending.forEach { file ->
            val text = if (file.extension.lowercase(Locale.ROOT) == "pdf") {
                engine.extractPdfTextAndPageCount(file.uri, ocrLanguage).first
            } else {
                engine.extractTextFromImage(file.uri, ocrLanguage)
            }
            dao.updateOcrResult(file.id, text, "done")
            dao.getFileById(file.id)?.let { rebuildEmbeddings(it) }
            processed++
        }
        processed
    }

    fun resolveDisplayName(uri: Uri): String {
        if (uri.scheme == "content") {
            try {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        val name = c.getString(0)
                        if (!name.isNullOrBlank()) return name
                    }
                }
            } catch (_: Exception) {}
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "Document_${System.currentTimeMillis()}"
    }

    private fun computeSha256(file: File): String {
        return try {
            val md = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { ins ->
                val buf = ByteArray(16 * 1024)
                var read: Int
                while (ins.read(buf).also { read = it } != -1) {
                    md.update(buf, 0, read)
                }
            }
            md.digest().joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            ""
        }
    }
}

