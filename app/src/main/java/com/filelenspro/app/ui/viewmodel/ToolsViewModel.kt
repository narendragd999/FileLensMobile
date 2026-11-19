package com.filelenspro.app.ui.viewmodel

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.DuplicateGroup
import com.filelenspro.app.data.model.JunkCacheStats
import com.filelenspro.app.data.model.SemanticDuplicateGroup
import com.filelenspro.app.data.model.StorageAnalysis
import com.filelenspro.app.data.model.StorageItem
import com.filelenspro.app.data.model.VisualCluster
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.service.LanHttpServer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.time.Instant

class ToolsViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as FileLensApplication
    private val dao = app.database.dao()
    private val prefs = app.preferences
    val engine = app.ocrAndPdfEngine
    private val indexer = app.documentIndexer
    private val analyzer = app.storageAnalyzer
    private val httpServer = app.lanHttpServer
    private val ftpServer = app.lanFtpServer

    val pdfAndScannedDocs = dao.observePdfAndScannedDocuments().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val cards = dao.observeCards().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val allFiles = dao.observeAllFiles().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val userPrefs = prefs.prefsFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), com.filelenspro.app.data.prefs.UserPrefs())

    private val _toastMessage = MutableStateFlow<String?>(null)
    val toastMessage: StateFlow<String?> = _toastMessage.asStateFlow()

    // ─── File Manager State ───
    private val _currentFolderPath = MutableStateFlow<String?>(null)
    val currentFolderPath: StateFlow<String?> = _currentFolderPath.asStateFlow()

    private val _folderItems = MutableStateFlow<List<StorageItem>>(analyzer.getAppRootFolders())
    val folderItems: StateFlow<List<StorageItem>> = _folderItems.asStateFlow()

    private val _clipboardItems = MutableStateFlow<List<StorageItem>>(emptyList())
    val clipboardItems: StateFlow<List<StorageItem>> = _clipboardItems.asStateFlow()

    private val _clipboardIsMove = MutableStateFlow(false)
    val clipboardIsMove: StateFlow<Boolean> = _clipboardIsMove.asStateFlow()

    // ─── LAN / Wi-Fi Share State ───
    private val _httpServerUrl = MutableStateFlow("")
    val httpServerUrl: StateFlow<String> = _httpServerUrl.asStateFlow()
    private val _isHttpRunning = MutableStateFlow(false)
    val isHttpRunning: StateFlow<Boolean> = _isHttpRunning.asStateFlow()

    private val _ftpServerUrl = MutableStateFlow("")
    val ftpServerUrl: StateFlow<String> = _ftpServerUrl.asStateFlow()
    private val _isFtpRunning = MutableStateFlow(false)
    val isFtpRunning: StateFlow<Boolean> = _isFtpRunning.asStateFlow()

    // ─── Storage Analyser State ───
    private val _storageAnalysis = MutableStateFlow<StorageAnalysis?>(null)
    val storageAnalysis: StateFlow<StorageAnalysis?> = _storageAnalysis.asStateFlow()
    private val _junkStats = MutableStateFlow<JunkCacheStats?>(null)
    val junkStats: StateFlow<JunkCacheStats?> = _junkStats.asStateFlow()
    private val _duplicates = MutableStateFlow<List<DuplicateGroup>>(emptyList())
    val duplicates: StateFlow<List<DuplicateGroup>> = _duplicates.asStateFlow()
    private val _visualClusters = MutableStateFlow<List<VisualCluster>>(emptyList())
    val visualClusters: StateFlow<List<VisualCluster>> = _visualClusters.asStateFlow()
    private val _semanticDuplicates = MutableStateFlow<List<SemanticDuplicateGroup>>(emptyList())
    val semanticDuplicates: StateFlow<List<SemanticDuplicateGroup>> = _semanticDuplicates.asStateFlow()
    private val _isAnalyzing = MutableStateFlow(false)
    val isAnalyzing: StateFlow<Boolean> = _isAnalyzing.asStateFlow()

    // ─── Page Organizer State ───
    private val _organizerPages = MutableStateFlow<List<String>>(emptyList())
    val organizerPages: StateFlow<List<String>> = _organizerPages.asStateFlow()
    private val _isOrganizerBusy = MutableStateFlow(false)
    val isOrganizerBusy: StateFlow<Boolean> = _isOrganizerBusy.asStateFlow()

    init {
        viewModelScope.launch { prefs.ensureMachineId() }
    }

    fun clearToast() { _toastMessage.value = null }
    fun postToast(msg: String) { _toastMessage.value = msg }

    // ─── Documents & Scanner Operations ───
    fun saveScannedImagesAsPdf(imageUris: List<Uri>, title: String, isCard: Boolean = false, cardTag: String = "", onDone: (FileEntity?) -> Unit = {}) {
        viewModelScope.launch {
            val scanDir = File(app.filesDir, if (isCard) "SmartCards" else "ScannedDocs").apply { mkdirs() }
            val cleanTitle = title.ifBlank { "Scan_${System.currentTimeMillis()}" }.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val outPdf = File(scanDir, if (cleanTitle.endsWith(".pdf", true)) cleanTitle else "$cleanTitle.pdf")
            val ok = engine.buildPdfFromImages(imageUris.map { it.toString() }, outPdf)
            if (ok) {
                val saved = indexer.indexLocalFile(
                    file = outPdf,
                    displayName = outPdf.name,
                    ocrLanguage = userPrefs.value.ocrLanguage,
                    isCard = isCard,
                    customTag = cardTag,
                    isScanned = true
                )
                _toastMessage.value = "Saved ${outPdf.name} (${saved?.pageCount ?: 1} pages)"
                onDone(saved)
            } else {
                _toastMessage.value = "Failed to build PDF from scan."
                onDone(null)
            }
        }
    }

    fun saveIdCard2In1Pdf(frontUri: Uri, backUri: Uri?, tag: String, title: String, onDone: (FileEntity?) -> Unit = {}) {
        viewModelScope.launch {
            val dir = File(app.filesDir, "SmartCards").apply { mkdirs() }
            val clean = title.ifBlank { "ID_Card_${System.currentTimeMillis()}" }.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val outPdf = File(dir, "$clean.pdf")
            val ok = engine.buildIdCard2In1Pdf(frontUri.toString(), backUri?.toString(), outPdf)
            if (ok) {
                val saved = indexer.indexLocalFile(
                    file = outPdf,
                    displayName = outPdf.name,
                    ocrLanguage = userPrefs.value.ocrLanguage,
                    isCard = true,
                    customTag = tag.ifBlank { "ID Card" },
                    isScanned = true
                )
                _toastMessage.value = "2-in-1 A4 ID Card saved."
                onDone(saved)
            } else {
                _toastMessage.value = "Failed to composite 2-in-1 ID card."
                onDone(null)
            }
        }
    }

    fun createOrUpdateCardFromUri(uri: Uri, tag: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            indexer.indexSingleUri(uri, userPrefs.value.ocrLanguage, isCard = true, customTag = tag)
            _toastMessage.value = "Saved to Smart Cards ($tag)"
            onDone()
        }
    }

    fun updateCardTag(fileId: Long, newTag: String) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.updateCardTag(fileId, true, newTag)
            _toastMessage.value = "Tag updated to $newTag"
        }
    }

    fun promoteFileToCard(file: FileEntity, tag: String) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.updateCardTag(file.id, true, tag.ifBlank { "Document" })
            _toastMessage.value = "Added \"${file.name}\" to Smart Cards"
        }
    }

    fun renameDocument(file: FileEntity, newName: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val trimmed = newName.trim()
            if (trimmed.isBlank()) return@launch
            val finalName = if (file.extension.isNotBlank() && !trimmed.contains(".")) "$trimmed.${file.extension}" else trimmed
            val localFile = com.filelenspro.app.util.FormatUtils.resolveLocalFile(file.uri)
            val newUri = if (localFile != null && localFile.exists()) {
                val target = File(localFile.parentFile, finalName)
                if (localFile.renameTo(target)) target.toURI().toString() else file.uri
            } else file.uri
            dao.renameFileRecord(file.id, finalName, newUri)
            _toastMessage.value = "Renamed to $finalName"
        }
    }

    fun deleteIndexedFile(file: FileEntity, deletePhysical: Boolean = true) {
        viewModelScope.launch(Dispatchers.IO) {
            if (deletePhysical) analyzer.deleteLocalUri(file.uri)
            dao.deleteFileById(file.id)
            dao.deleteBookmarkByUri(file.uri)
            _toastMessage.value = "Deleted ${file.name}"
        }
    }

    fun rerunOcrForFile(file: FileEntity) {
        viewModelScope.launch {
            val text = if (file.extension.equals("pdf", true)) {
                engine.extractPdfTextAndPageCount(file.uri, userPrefs.value.ocrLanguage).first
            } else {
                engine.extractTextFromImage(file.uri, userPrefs.value.ocrLanguage)
            }
            dao.updateOcrResult(file.id, text, "done")
            dao.getFileById(file.id)?.let { indexer.rebuildEmbeddings(it) }
            _toastMessage.value = if (text.isNotBlank()) "OCR extracted ${text.length} characters" else "No readable text found"
        }
    }

    fun applyImageWatermark(file: FileEntity, text: String, colorInt: Int, alpha: Float) {
        viewModelScope.launch {
            val outFile = File(File(app.filesDir, "ScannedDocs").apply { mkdirs() }, "wm_${System.currentTimeMillis()}_${file.name}")
            val ok = engine.applyWatermarkToImage(file.uri, text, colorInt, alpha, outFile)
            if (ok) {
                indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage, file.isCard, file.customTag, file.isScanned)
                _toastMessage.value = "Watermarked copy saved: ${outFile.name}"
            }
        }
    }

    fun applyImageSignature(file: FileEntity, signatureBitmap: Bitmap) {
        viewModelScope.launch {
            val outFile = File(File(app.filesDir, "ScannedDocs").apply { mkdirs() }, "signed_${System.currentTimeMillis()}_${file.name}")
            val ok = engine.applySignatureToImage(file.uri, signatureBitmap, outFile)
            if (ok) {
                indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage, file.isCard, file.customTag, file.isScanned)
                _toastMessage.value = "Signed copy saved: ${outFile.name}"
            }
        }
    }

    fun applyImageFilterOrRotate(file: FileEntity, filter: String, rotationDeg: Int) {
        viewModelScope.launch {
            val target = com.filelenspro.app.util.FormatUtils.resolveLocalFile(file.uri)
                ?: File(File(app.filesDir, "ScannedDocs").apply { mkdirs() }, "edited_${System.currentTimeMillis()}.jpg")
            val ok = engine.applyImageFilterAndRotation(file.uri, filter, rotationDeg, target)
            if (ok) {
                indexer.indexLocalFile(target, file.name, userPrefs.value.ocrLanguage, file.isCard, file.customTag, file.isScanned)
                _toastMessage.value = "Updated image with $filter filter"
            }
        }
    }

    // ─── File Manager Operations ───
    fun openFolder(path: String?) {
        _currentFolderPath.value = path
        _folderItems.value = if (path == null) analyzer.getAppRootFolders() else analyzer.listDirectory(path)
    }

    fun navigateUpFolder() {
        val curr = _currentFolderPath.value ?: return
        val appFilesRoot = app.filesDir.absolutePath
        val parent = File(curr).parentFile?.absolutePath
        if (parent == null || parent == appFilesRoot || !parent.startsWith(appFilesRoot)) {
            openFolder(null)
        } else {
            openFolder(parent)
        }
    }

    fun createFolder(name: String) {
        val base = _currentFolderPath.value ?: File(app.filesDir, "IndexedDocs").absolutePath
        val dir = File(base, name.trim())
        if (dir.mkdirs()) {
            openFolder(_currentFolderPath.value)
            _toastMessage.value = "Created folder ${dir.name}"
        }
    }

    fun stageClipboard(items: List<StorageItem>, isMove: Boolean) {
        _clipboardItems.value = items
        _clipboardIsMove.value = isMove
        _toastMessage.value = "${items.size} item(s) ready to ${if (isMove) "move" else "copy"}"
    }

    fun pasteClipboardHere() {
        val destPath = _currentFolderPath.value ?: File(app.filesDir, "IndexedDocs").absolutePath
        val items = _clipboardItems.value
        val isMove = _clipboardIsMove.value
        if (items.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            items.forEach { item ->
                val src = File(item.path)
                val dst = File(destPath, src.name)
                if (src.exists() && src.absolutePath != dst.absolutePath) {
                    src.copyRecursively(dst, overwrite = true)
                    if (isMove) src.deleteRecursively()
                }
            }
            _clipboardItems.value = emptyList()
            openFolder(_currentFolderPath.value)
            _toastMessage.value = "${if (isMove) "Moved" else "Copied"} ${items.size} item(s)"
        }
    }

    fun deleteStorageItems(items: List<StorageItem>) {
        viewModelScope.launch(Dispatchers.IO) {
            items.forEach { item ->
                File(item.path).deleteRecursively()
                dao.deleteFileByUri(File(item.path).toURI().toString())
            }
            openFolder(_currentFolderPath.value)
            _toastMessage.value = "Deleted ${items.size} item(s)"
        }
    }

    // ─── LAN HTTP / FTP Server ───
    fun startLanShare(items: List<StorageItem>) {
        viewModelScope.launch(Dispatchers.IO) {
            val shared = items.map {
                LanHttpServer.SharedFile(
                    id = it.path.hashCode().toString(),
                    name = it.name,
                    uri = it.path,
                    size = it.size,
                    mimeType = it.mimeType
                )
            }
            httpServer.setFiles(shared)
            val port = httpServer.start()
            val ip = LanHttpServer.getLocalWifiIp(app) ?: "127.0.0.1"
            _httpServerUrl.value = "http://$ip:$port"
            _isHttpRunning.value = true
        }
    }

    fun stopLanShare() {
        httpServer.stop()
        _isHttpRunning.value = false
    }

    fun toggleFtpServer() {
        viewModelScope.launch(Dispatchers.IO) {
            if (_isFtpRunning.value) {
                ftpServer.stop()
                _isFtpRunning.value = false
            } else {
                val port = ftpServer.start()
                val ip = LanHttpServer.getLocalWifiIp(app) ?: "127.0.0.1"
                _ftpServerUrl.value = "ftp://$ip:$port"
                _isFtpRunning.value = true
            }
        }
    }

    // ─── Storage Analyser Operations ───
    fun runStorageAnalysis() {
        viewModelScope.launch {
            _isAnalyzing.value = true
            val files = dao.getAllFiles()
            _storageAnalysis.value = analyzer.analyzeStorage(files)
            _junkStats.value = analyzer.getJunkCacheStats()
            _duplicates.value = analyzer.findExactDuplicates(files)
            _visualClusters.value = analyzer.findSimilarImages(files)
            _semanticDuplicates.value = SmartTaxonomy.findSemanticDuplicates(files)
            _isAnalyzing.value = false
        }
    }

    fun cleanJunkCache() {
        viewModelScope.launch {
            val freed = analyzer.cleanJunkCache()
            _junkStats.value = analyzer.getJunkCacheStats()
            _toastMessage.value = "Cleaned ${com.filelenspro.app.util.FormatUtils.formatSize(freed)} of cache"
        }
    }

    fun toggleDuplicateSelection(hash: String, fileId: Long) {
        _duplicates.value = _duplicates.value.map { g ->
            if (g.hash == hash) {
                g.copy(files = g.files.map { f ->
                    if (f.id == fileId && !f.isOriginal) f.copy(selectedForDeletion = !f.selectedForDeletion) else f
                })
            } else g
        }
    }

    fun deleteSelectedDuplicates() {
        viewModelScope.launch(Dispatchers.IO) {
            val toDelete = _duplicates.value.flatMap { it.files }.filter { it.selectedForDeletion && !it.isOriginal }
            toDelete.forEach {
                analyzer.deleteLocalUri(it.uri)
                dao.deleteFileById(it.id)
            }
            _toastMessage.value = "Deleted ${toDelete.size} exact duplicate(s)"
            runStorageAnalysis()
        }
    }

    fun toggleSimilarSelection(clusterId: String, fileId: Long) {
        _visualClusters.value = _visualClusters.value.map { c ->
            if (c.clusterId == clusterId) {
                c.copy(items = c.items.map { it ->
                    if (it.id == fileId && !it.isBestShot) it.copy(selectedForDeletion = !it.selectedForDeletion) else it
                })
            } else c
        }
    }

    fun deleteSelectedSimilarImages() {
        viewModelScope.launch(Dispatchers.IO) {
            val toDelete = _visualClusters.value.flatMap { it.items }.filter { it.selectedForDeletion && !it.isBestShot }
            toDelete.forEach {
                analyzer.deleteLocalUri(it.uri)
                dao.deleteFileById(it.id)
            }
            _toastMessage.value = "Deleted ${toDelete.size} redundant photo(s)"
            runStorageAnalysis()
        }
    }

    fun toggleSemanticSelection(groupId: String, fileId: Long) {
        _semanticDuplicates.value = _semanticDuplicates.value.map { g ->
            if (g.groupId == groupId) {
                val next = g.selectedIds.toMutableSet()
                if (!next.add(fileId)) next.remove(fileId)
                g.copy(selectedIds = next)
            } else g
        }
    }

    fun setAllSemanticSelected(selectAll: Boolean) {
        _semanticDuplicates.value = _semanticDuplicates.value.map { g ->
            g.copy(selectedIds = if (selectAll) g.files.drop(1).map { it.id }.toSet() else emptySet())
        }
    }

    fun deleteSelectedSemanticClones() {
        viewModelScope.launch(Dispatchers.IO) {
            val ids = _semanticDuplicates.value.flatMap { it.selectedIds }
            ids.forEach { id ->
                dao.getFileById(id)?.let { analyzer.deleteLocalUri(it.uri) }
                dao.deleteFileById(id)
            }
            _toastMessage.value = "Removed ${ids.size} semantic clone(s)"
            runStorageAnalysis()
        }
    }

    // ─── Page Organizer Operations ───
    fun loadOrganizerPages(pdfUri: String, forceRefresh: Boolean = false) {
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            _organizerPages.value = engine.renderPdfToImages(pdfUri, limit = 80, maxDim = 900, forceRefresh = forceRefresh)
            _isOrganizerBusy.value = false
        }
    }

    fun rotateOrganizerPages(pdfUri: String, indices: Set<Int>, degrees: Int) {
        viewModelScope.launch {
            val local = com.filelenspro.app.util.FormatUtils.resolveLocalFile(pdfUri) ?: return@launch
            _isOrganizerBusy.value = true
            val map = indices.associateWith { degrees }
            if (engine.rotatePdfPages(pdfUri, map, local)) {
                updatePdfRecordAfterEdit(pdfUri, local)
                loadOrganizerPages(pdfUri, forceRefresh = true)
                _toastMessage.value = "Rotated ${indices.size} page(s)"
            }
            _isOrganizerBusy.value = false
        }
    }

    fun deleteOrganizerPages(pdfUri: String, indices: Set<Int>) {
        viewModelScope.launch {
            val local = com.filelenspro.app.util.FormatUtils.resolveLocalFile(pdfUri) ?: return@launch
            _isOrganizerBusy.value = true
            if (engine.deletePdfPages(pdfUri, indices, local)) {
                updatePdfRecordAfterEdit(pdfUri, local)
                loadOrganizerPages(pdfUri, forceRefresh = true)
                _toastMessage.value = "Deleted ${indices.size} page(s)"
            } else {
                _toastMessage.value = "Cannot delete all pages from a PDF"
            }
            _isOrganizerBusy.value = false
        }
    }

    fun moveOrganizerPage(pdfUri: String, fromIndex: Int, toIndex: Int) {
        val count = _organizerPages.value.size
        if (fromIndex !in 0 until count || toIndex !in 0 until count || fromIndex == toIndex) return
        viewModelScope.launch {
            val local = com.filelenspro.app.util.FormatUtils.resolveLocalFile(pdfUri) ?: return@launch
            _isOrganizerBusy.value = true
            val order = (0 until count).toMutableList()
            val moved = order.removeAt(fromIndex)
            order.add(toIndex, moved)
            if (engine.reorderPdfPages(pdfUri, order, local)) {
                updatePdfRecordAfterEdit(pdfUri, local)
                loadOrganizerPages(pdfUri, forceRefresh = true)
            }
            _isOrganizerBusy.value = false
        }
    }

    fun extractOrganizerPages(pdfUri: String, indices: Set<Int>, baseName: String) {
        viewModelScope.launch {
            val dir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val out = File(dir, "${baseName.substringBeforeLast('.')}_extracted_${System.currentTimeMillis()}.pdf")
            _isOrganizerBusy.value = true
            if (engine.extractPdfPages(pdfUri, indices.sorted(), out)) {
                indexer.indexLocalFile(out, out.name, userPrefs.value.ocrLanguage, isScanned = true)
                _toastMessage.value = "Extracted ${indices.size} pages to ${out.name}"
            }
            _isOrganizerBusy.value = false
        }
    }

    fun mergeAnotherPdf(primaryUri: String, secondaryUri: Uri) {
        viewModelScope.launch {
            val local = com.filelenspro.app.util.FormatUtils.resolveLocalFile(primaryUri) ?: return@launch
            _isOrganizerBusy.value = true
            val tempOut = File(app.cacheDir, "merged_${System.currentTimeMillis()}.pdf")
            if (engine.mergePdfs(listOf(primaryUri, secondaryUri.toString()), tempOut)) {
                tempOut.copyTo(local, overwrite = true)
                tempOut.delete()
                updatePdfRecordAfterEdit(primaryUri, local)
                loadOrganizerPages(primaryUri, forceRefresh = true)
                _toastMessage.value = "Merged PDF pages successfully"
            }
            _isOrganizerBusy.value = false
        }
    }

    private suspend fun updatePdfRecordAfterEdit(pdfUri: String, localFile: File) {
        val count = engine.getPdfPageCount(pdfUri)
        dao.getFileByUri(pdfUri)?.let {
            dao.updateDocumentMetadata(it.id, count, localFile.length(), Instant.now().toString())
        }
    }

    // ─── Settings & License ───
    fun setOcrLanguage(lang: String) { viewModelScope.launch { prefs.setOcrLanguage(lang) } }
    fun setSemanticAiEnabled(enabled: Boolean) { viewModelScope.launch { prefs.setSemanticAiEnabled(enabled) } }
    fun setDarkTheme(enabled: Boolean) { viewModelScope.launch { prefs.setDarkTheme(enabled) } }
    fun saveAiConfig(url: String, model: String, key: String) {
        viewModelScope.launch {
            prefs.saveAiConfig(url, model, key)
            _toastMessage.value = "AI configuration saved"
        }
    }

    fun rerunAllPendingOcr() {
        viewModelScope.launch {
            val count = indexer.rerunPendingOcr(userPrefs.value.ocrLanguage)
            _toastMessage.value = if (count > 0) "Processed OCR for $count pending file(s)" else "No pending OCR files"
        }
    }

    fun clearSearchIndex() {
        viewModelScope.launch(Dispatchers.IO) {
            dao.clearAllFiles()
            _toastMessage.value = "Search index cleared. Original device files remain safe."
        }
    }

    fun activateLicense(key: String) {
        // TODO: Integrate cross-platform FileLens license server / Google Play Billing verification
        val clean = key.trim().uppercase()
        viewModelScope.launch {
            if (clean.startsWith("FL-") && clean.length >= 12) {
                prefs.saveLicense(clean, true)
                _toastMessage.value = "FileSearchPro activated on this device!"
            } else {
                _toastMessage.value = "Invalid key format. Expected FL-XX-XXXX-XXXX-XXXX"
            }
        }
    }

    fun releaseLicense() {
        viewModelScope.launch {
            prefs.saveLicense("", false)
            _toastMessage.value = "License released from this device."
        }
    }
}
