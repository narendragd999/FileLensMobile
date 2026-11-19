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
import com.filelenspro.app.data.model.DeviceIndexSummary
import com.filelenspro.app.data.model.IndexProgress
import com.filelenspro.app.domain.engine.EmbeddingEngine
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.util.FormatUtils
import com.filelenspro.app.util.StoragePermissionHelper
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
import java.util.ArrayDeque
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.ZipInputStream
import kotlin.coroutines.coroutineContext

class DocumentIndexer(
    private val context: Context,
    private val dao: FileLensDao,
    private val engine: OcrAndPdfEngine
) {
    companion object {
        private val INDEXABLE_EXTENSIONS = setOf(
            "pdf",
            "jpg", "jpeg", "png", "webp", "bmp",
            "txt", "md", "csv", "json", "xml", "log", "html", "htm", "rtf",
            "doc", "docx", "xls", "xlsx", "ppt", "pptx"
        )

        private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "bmp")

        private val OFFICE_ZIP_EXTENSIONS = setOf("docx", "xlsx", "pptx")

        private val SKIPPED_DIR_NAMES = setOf(
            "android",
            ".thumbnails",
            ".trash",
            ".trashbin",
            ".cache",
            "cache",
            "temp",
            "tmp",
            "lost+found",
            "alarms",
            "ringtones",
            "notifications",
            "podcasts",
            "audiobooks",
            "music",
            "movies"
        )

        private const val MAX_DEVICE_FILE_SIZE_BYTES = 40L * 1024L * 1024L // 40 MB
        private const val MAX_DEVICE_SCAN_FILES = 5000
    }

    private val _isIndexing = MutableStateFlow(false)
    val isIndexing: StateFlow<Boolean> = _isIndexing.asStateFlow()

    private val _progress = MutableStateFlow<IndexProgress?>(null)
    val progress: StateFlow<IndexProgress?> = _progress.asStateFlow()

    private val _lastIndexSummary = MutableStateFlow<DeviceIndexSummary?>(null)
    val lastIndexSummary: StateFlow<DeviceIndexSummary?> = _lastIndexSummary.asStateFlow()

    private val cancelRequested = AtomicBoolean(false)

    @Volatile
    private var currentJob: Job? = null

    fun cancel() {
        cancelRequested.set(true)
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
        cancelRequested.set(false)
        currentJob = coroutineContext[Job]
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
                            if (cancelRequested.get()) return@withPermit null
                            val name = resolveDisplayName(uri)
                            _progress.value = IndexProgress(
                                indexed = completed.get(),
                                total = uris.size,
                                currentFile = name,
                                phase = "Indexing Picked Files"
                            )
                            val saved = indexSingleUri(uri, ocrLanguage, isCard, customTag, isScanned)
                            val doneCount = completed.incrementAndGet()
                            _progress.value = IndexProgress(
                                indexed = doneCount,
                                total = uris.size,
                                currentFile = name,
                                phase = "Indexing Picked Files"
                            )
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
            currentJob = null
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
     * Full-device incremental indexing engine.
     * Walks `/storage/emulated/0` (requires All Files Access) + App Vault + SAF folders,
     * prunes deleted records, skips unchanged files via size + lastModified comparison,
     * and processes only newly added or modified documents in parallel.
     */
    suspend fun indexEntireDevice(
        ocrLanguage: String = "eng+hin",
        forceReindex: Boolean = false
    ): DeviceIndexSummary? = withContext(Dispatchers.IO) {
        if (!StoragePermissionHelper.hasAllFilesAccess(context)) return@withContext null
        if (_isIndexing.value) return@withContext null

        val startMs = System.currentTimeMillis()
        cancelRequested.set(false)
        currentJob = coroutineContext[Job]
        _isIndexing.value = true

        var removedDeleted = 0
        var skippedUnchanged = 0
        var newOrUpdatedCount = 0
        var totalScanned = 0
        var wasCancelled = false

        try {
            FileLensBackgroundService.start(
                context,
                if (forceReindex) "Full Device Re-Index" else "Entire Device Incremental Index",
                "Scanning device storage..."
            )
            _progress.value = IndexProgress(
                indexed = 0,
                total = 0,
                currentFile = "Scanning device folders…",
                phase = "Scanning Device Storage",
                isFullDevice = true
            )

            val existingByUri = dao.getAllFiles().associateBy { it.uri }

            // Phase 1: Prune deleted file:// records from index
            existingByUri.values.forEach { entity ->
                if (cancelRequested.get()) throw CancellationException()
                if (entity.uri.startsWith("file://")) {
                    val local = FormatUtils.resolveLocalFile(entity.uri)
                    if (local == null || !local.exists()) {
                        dao.deleteFileById(entity.id)
                        removedDeleted++
                    }
                }
            }

            // Phase 2: Discover all indexable files across device storage + vault
            data class FileCandidate(val file: File, val isCard: Boolean, val isScanned: Boolean)

            val discoveredByPath = LinkedHashMap<String, FileCandidate>()

            // 2a. App vault folders (preserve isCard / isScanned metadata)
            val vaultFolders = listOf(
                Triple(File(context.filesDir, "ScannedDocs"), false, true),
                Triple(File(context.filesDir, "SmartCards"), true, true),
                Triple(File(context.filesDir, "IndexedDocs"), false, false),
                Triple(File(context.filesDir, "VoiceNotes"), false, false)
            )
            vaultFolders.forEach { (dir, isCard, isScanned) ->
                if (dir.exists() && dir.isDirectory) {
                    walkDirectoryIteratively(dir, MAX_DEVICE_SCAN_FILES) { file ->
                        if (isIndexableFile(file)) {
                            discoveredByPath[file.absolutePath] = FileCandidate(file, isCard, isScanned)
                        }
                    }
                }
            }

            // 2b. Entire device primary external storage (/storage/emulated/0)
            val externalRoot = StoragePermissionHelper.getPrimaryStorageDirectory()
            if (externalRoot.exists() && externalRoot.canRead()) {
                var discoveredCounter = discoveredByPath.size
                walkDirectoryIteratively(externalRoot, MAX_DEVICE_SCAN_FILES) { file ->
                    if (isIndexableFile(file) && !discoveredByPath.containsKey(file.absolutePath)) {
                        discoveredByPath[file.absolutePath] = FileCandidate(file, isCard = false, isScanned = false)
                        discoveredCounter++
                        if (discoveredCounter % 25 == 0) {
                            _progress.value = IndexProgress(
                                indexed = 0,
                                total = discoveredCounter,
                                currentFile = file.name,
                                phase = "Scanning Device ($discoveredCounter found)",
                                removedDeleted = removedDeleted,
                                isFullDevice = true
                            )
                        }
                    }
                }
            }

            // 2c. Persisted SAF folders
            val safUris = mutableListOf<Uri>()
            dao.getIndexTargets().forEach { target ->
                if (cancelRequested.get()) throw CancellationException()
                runCatching {
                    val treeUri = Uri.parse(target.uri)
                    collectSafDocumentUris(treeUri, DocumentsContract.getTreeDocumentId(treeUri), safUris, maxDepth = 4)
                }
            }

            // Phase 3: Delta Comparison (skip unchanged files!)
            val deltaLocal = mutableListOf<FileCandidate>()
            discoveredByPath.values.forEach { candidate ->
                if (cancelRequested.get()) throw CancellationException()
                totalScanned++
                val file = candidate.file
                val uriStr = file.toUri().toString()
                val existing = existingByUri[uriStr]
                val modifiedIso = Instant.ofEpochMilli(file.lastModified()).toString()
                val isUnchanged = !forceReindex &&
                    existing != null &&
                    existing.size == file.length() &&
                    existing.modified == modifiedIso &&
                    existing.ocrStatus != "pending"

                if (isUnchanged) {
                    skippedUnchanged++
                } else {
                    deltaLocal.add(candidate)
                }
            }

            // Sort newest files first so recent docs, bills, and scans appear immediately
            deltaLocal.sortByDescending { it.file.lastModified() }

            val deltaSaf = safUris.filter { uri ->
                totalScanned++
                val existing = existingByUri[uri.toString()]
                val unchanged = !forceReindex && existing != null && existing.ocrStatus != "pending"
                if (unchanged) skippedUnchanged++
                !unchanged
            }

            val totalDelta = deltaLocal.size + deltaSaf.size
            val phaseLabel = if (forceReindex) "Full Re-Indexing" else "Incremental Indexing"

            if (totalDelta > 0) {
                FileLensBackgroundService.update(
                    context,
                    phaseLabel,
                    "Processing $totalDelta new/changed ($skippedUnchanged unchanged skipped)",
                    0,
                    totalDelta
                )
                val done = AtomicInteger(0)
                val semaphore = Semaphore(3)
                coroutineScope {
                    val localJobs = deltaLocal.map { candidate ->
                        async {
                            semaphore.withPermit {
                                if (cancelRequested.get()) return@withPermit false
                                val res = indexLocalFile(
                                    file = candidate.file,
                                    displayName = candidate.file.name,
                                    ocrLanguage = ocrLanguage,
                                    isCard = candidate.isCard,
                                    isScanned = candidate.isScanned
                                )
                                val d = done.incrementAndGet()
                                _progress.value = IndexProgress(
                                    indexed = d,
                                    total = totalDelta,
                                    currentFile = candidate.file.name,
                                    phase = phaseLabel,
                                    skippedUnchanged = skippedUnchanged,
                                    removedDeleted = removedDeleted,
                                    isFullDevice = true
                                )
                                if (d % 5 == 0 || d == totalDelta) {
                                    FileLensBackgroundService.update(
                                        context,
                                        phaseLabel,
                                        "Indexed $d/$totalDelta · Skipped $skippedUnchanged unchanged",
                                        d,
                                        totalDelta
                                    )
                                }
                                res != null
                            }
                        }
                    }
                    val safJobs = deltaSaf.map { uri ->
                        async {
                            semaphore.withPermit {
                                if (cancelRequested.get()) return@withPermit false
                                val res = indexSingleUri(uri, ocrLanguage = ocrLanguage)
                                val d = done.incrementAndGet()
                                _progress.value = IndexProgress(
                                    indexed = d,
                                    total = totalDelta,
                                    currentFile = resolveDisplayName(uri),
                                    phase = phaseLabel,
                                    skippedUnchanged = skippedUnchanged,
                                    removedDeleted = removedDeleted,
                                    isFullDevice = true
                                )
                                res != null
                            }
                        }
                    }
                    newOrUpdatedCount = (localJobs + safJobs).awaitAll().count { it }
                }
            }
        } catch (_: CancellationException) {
            wasCancelled = true
        } catch (_: Exception) {
        } finally {
            val summary = DeviceIndexSummary(
                newOrUpdated = newOrUpdatedCount,
                skippedUnchanged = skippedUnchanged,
                removedDeleted = removedDeleted,
                totalScanned = totalScanned,
                elapsedMs = (System.currentTimeMillis() - startMs).coerceAtLeast(1L),
                isFullDevice = true,
                wasCancelled = wasCancelled,
                timestampIso = Instant.now().toString()
            )
            _lastIndexSummary.value = summary
            currentJob = null
            _isIndexing.value = false
            _progress.value = null
            FileLensBackgroundService.stop(context)
        }
        _lastIndexSummary.value
    }

    /**
     * Automatically discovers new or modified files across device storage (if All Files Access is granted),
     * app vault folders (`ScannedDocs`, `SmartCards`, `IndexedDocs`, `VoiceNotes`), and persisted SAF folders,
     * removes deleted entries, and incrementally indexes/re-indexes changed items.
     */
    suspend fun syncAndReindexAll(
        ocrLanguage: String = "eng+hin",
        forceReindex: Boolean = false
    ): Int = withContext(Dispatchers.IO) {
        if (StoragePermissionHelper.hasAllFilesAccess(context)) {
            val summary = indexEntireDevice(ocrLanguage = ocrLanguage, forceReindex = forceReindex)
            return@withContext summary?.newOrUpdated ?: 0
        }

        if (_isIndexing.value) return@withContext 0
        val startMs = System.currentTimeMillis()
        cancelRequested.set(false)
        currentJob = coroutineContext[Job]
        _isIndexing.value = true

        var syncedCount = 0
        var skippedUnchanged = 0
        var removedDeleted = 0
        var totalScanned = 0
        var wasCancelled = false

        try {
            val existingByUri = dao.getAllFiles().associateBy { it.uri }

            // 1. Clean up missing local vault records
            existingByUri.values.forEach { entity ->
                if (cancelRequested.get()) throw CancellationException()
                if (entity.uri.startsWith("file://")) {
                    val local = FormatUtils.resolveLocalFile(entity.uri)
                    if (local == null || !local.exists()) {
                        dao.deleteFileById(entity.id)
                        removedDeleted++
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
                        if (cancelRequested.get()) throw CancellationException()
                        totalScanned++
                        val uriStr = f.toUri().toString()
                        val existing = existingByUri[uriStr]
                        val modifiedIso = Instant.ofEpochMilli(f.lastModified()).toString()
                        val isUnchanged = !forceReindex &&
                            existing != null &&
                            existing.size == f.length() &&
                            existing.modified == modifiedIso &&
                            existing.ocrStatus != "pending"
                        if (isUnchanged) {
                            skippedUnchanged++
                        } else {
                            localCandidates.add(Triple(f, isCard, isScanned))
                        }
                    }
                }
            }

            // 3. Collect new/modified files from persisted SAF folders
            val safUris = mutableListOf<Uri>()
            dao.getIndexTargets().forEach { target ->
                if (cancelRequested.get()) throw CancellationException()
                runCatching {
                    val treeUri = Uri.parse(target.uri)
                    collectSafDocumentUris(treeUri, DocumentsContract.getTreeDocumentId(treeUri), safUris, maxDepth = 4)
                }
            }
            val newSafUris = safUris.filter { uri ->
                totalScanned++
                val existing = existingByUri[uri.toString()]
                val unchanged = !forceReindex && existing != null && existing.ocrStatus != "pending"
                if (unchanged) skippedUnchanged++
                !unchanged
            }

            val total = localCandidates.size + newSafUris.size
            if (total > 0) {
                val phase = if (forceReindex) "Re-Indexing Vault" else "Incremental Sync"
                FileLensBackgroundService.start(context, phase, "Scanning $total new or updated files...")
                val done = AtomicInteger(0)
                val semaphore = Semaphore(3)
                coroutineScope {
                    val localJobs = localCandidates.map { (file, isCard, isScanned) ->
                        async {
                            semaphore.withPermit {
                                if (cancelRequested.get()) return@withPermit false
                                val res = indexLocalFile(
                                    file = file,
                                    displayName = file.name,
                                    ocrLanguage = ocrLanguage,
                                    isCard = isCard,
                                    isScanned = isScanned
                                )
                                val d = done.incrementAndGet()
                                _progress.value = IndexProgress(
                                    indexed = d,
                                    total = total,
                                    currentFile = file.name,
                                    phase = phase,
                                    skippedUnchanged = skippedUnchanged,
                                    removedDeleted = removedDeleted,
                                    isFullDevice = false
                                )
                                res != null
                            }
                        }
                    }
                    val safJobs = newSafUris.map { uri ->
                        async {
                            semaphore.withPermit {
                                if (cancelRequested.get()) return@withPermit false
                                val res = indexSingleUri(uri, ocrLanguage = ocrLanguage)
                                val d = done.incrementAndGet()
                                _progress.value = IndexProgress(
                                    indexed = d,
                                    total = total,
                                    currentFile = resolveDisplayName(uri),
                                    phase = phase,
                                    skippedUnchanged = skippedUnchanged,
                                    removedDeleted = removedDeleted,
                                    isFullDevice = false
                                )
                                res != null
                            }
                        }
                    }
                    syncedCount = (localJobs + safJobs).awaitAll().count { it }
                }
            }
        } catch (_: CancellationException) {
            wasCancelled = true
        } catch (_: Exception) {
        } finally {
            _lastIndexSummary.value = DeviceIndexSummary(
                newOrUpdated = syncedCount,
                skippedUnchanged = skippedUnchanged,
                removedDeleted = removedDeleted,
                totalScanned = totalScanned,
                elapsedMs = (System.currentTimeMillis() - startMs).coerceAtLeast(1L),
                isFullDevice = false,
                wasCancelled = wasCancelled,
                timestampIso = Instant.now().toString()
            )
            currentJob = null
            _isIndexing.value = false
            _progress.value = null
            FileLensBackgroundService.stop(context)
        }
        syncedCount
    }

    private fun walkDirectoryIteratively(root: File, maxFiles: Int, onFile: (File) -> Unit) {
        val stack = ArrayDeque<File>()
        stack.add(root)
        var yielded = 0
        while (stack.isNotEmpty() && yielded < maxFiles) {
            if (cancelRequested.get()) throw CancellationException()
            val dir = stack.removeLast()
            val children = dir.listFiles() ?: continue
            for (child in children) {
                if (cancelRequested.get()) throw CancellationException()
                val name = child.name
                if (name.startsWith(".")) continue
                if (child.isDirectory) {
                    val lower = name.lowercase(Locale.ROOT)
                    if (lower !in SKIPPED_DIR_NAMES) {
                        stack.add(child)
                    }
                } else if (child.isFile) {
                    onFile(child)
                    yielded++
                    if (yielded >= maxFiles) break
                }
            }
        }
    }

    private fun isIndexableFile(file: File): Boolean {
        if (!file.isFile || !file.canRead()) return false
        val len = file.length()
        if (len <= 0L || len > MAX_DEVICE_FILE_SIZE_BYTES) return false
        val ext = file.extension.lowercase(Locale.ROOT)
        return ext in INDEXABLE_EXTENSIONS
    }

    private fun collectSafDocumentUris(treeUri: Uri, parentDocId: String, out: MutableList<Uri>, maxDepth: Int, depth: Int = 0) {
        if (depth > maxDepth || out.size >= 400 || cancelRequested.get()) return
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
            while (cursor.moveToNext() && out.size < 400 && !cancelRequested.get()) {
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
            in IMAGE_EXTENSIONS -> {
                val extracted = engine.extractTextFromImage(fileUri, ocrLanguage)
                ocrText = extracted
                ocrStatus = "done"
            }
            "txt", "md", "csv", "json", "xml", "log", "html", "htm", "rtf" -> {
                contentText = runCatching { file.readText().take(250_000) }.getOrNull()
                ocrStatus = "done"
            }
            in OFFICE_ZIP_EXTENSIONS -> {
                contentText = extractOfficeZipText(file)
                ocrStatus = if (!contentText.isNullOrBlank()) "done" else "skipped"
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
            fileType = if (ext in IMAGE_EXTENSIONS) "image" else if (ext == "pdf") "pdf" else "document",
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

    private fun extractOfficeZipText(file: File): String? {
        if (file.length() > 15L * 1024L * 1024L) return null
        return runCatching {
            val sb = StringBuilder()
            ZipInputStream(file.inputStream().buffered()).use { zis ->
                var entry = zis.nextEntry
                while (entry != null && sb.length < 180_000) {
                    val n = entry.name.lowercase(Locale.ROOT)
                    if (!entry.isDirectory && n.endsWith(".xml") &&
                        (n.startsWith("word/document") || n.startsWith("xl/sharedstrings") || n.startsWith("ppt/slides/slide"))
                    ) {
                        val xml = zis.bufferedReader().readText()
                        val cleaned = xml
                            .replace(Regex("<[^>]+>"), " ")
                            .replace(Regex("\\s+"), " ")
                            .trim()
                        if (cleaned.isNotBlank()) {
                            sb.append(cleaned).append('\n')
                        }
                    }
                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }
            sb.toString().trim().take(200_000).ifBlank { null }
        }.getOrNull()
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
