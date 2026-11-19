package com.filelenspro.app.ui.viewmodel

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.CleanerFileItem
import com.filelenspro.app.data.model.DuplicateGroup
import com.filelenspro.app.data.model.JunkCacheStats
import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.data.model.PdfCompressCandidate
import com.filelenspro.app.data.model.PdfCompressPreset
import com.filelenspro.app.data.model.PdfCompressSummary
import com.filelenspro.app.data.model.PdfPageSizePreset
import com.filelenspro.app.data.model.PdfQualityPreset
import com.filelenspro.app.data.model.PhotoCompressCandidate
import com.filelenspro.app.data.model.PhotoCompressPreset
import com.filelenspro.app.data.model.PhotoCompressSummary
import com.filelenspro.app.data.model.SavedSignatureItem
import com.filelenspro.app.data.model.SemanticDuplicateGroup
import com.filelenspro.app.data.model.SignaturePlacement
import com.filelenspro.app.data.model.StorageAnalysis
import com.filelenspro.app.data.model.StorageItem
import com.filelenspro.app.data.model.VisualCluster
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.service.BackgroundSyncScheduler
import com.filelenspro.app.service.BackupManager
import com.filelenspro.app.service.LanHttpServer
import com.filelenspro.app.ui.components.SmartToastClassifier
import com.filelenspro.app.ui.components.SmartToastEvent
import com.filelenspro.app.ui.components.SmartToastType
import com.filelenspro.app.widget.FileSearchWidgetProvider
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
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

    private val _toastEvent = MutableStateFlow<SmartToastEvent?>(null)
    val toastEvent: StateFlow<SmartToastEvent?> = _toastEvent.asStateFlow()

    private inner class ToastEmitter {
        var value: String?
            get() = _toastEvent.value?.message
            set(msg) {
                if (msg.isNullOrBlank()) {
                    _toastEvent.value = null
                } else {
                    _toastEvent.value = SmartToastClassifier.create(msg)
                }
            }
    }
    private val _toastMessage = ToastEmitter()

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

    // ─── Smart Photo Compression State ───
    private val _compressCandidates = MutableStateFlow<List<PhotoCompressCandidate>>(emptyList())
    val compressCandidates: StateFlow<List<PhotoCompressCandidate>> = _compressCandidates.asStateFlow()
    private val _compressPreset = MutableStateFlow(PhotoCompressPreset.LOSSLESS_LOOK)
    val compressPreset: StateFlow<PhotoCompressPreset> = _compressPreset.asStateFlow()
    private val _isCompressingPhotos = MutableStateFlow(false)
    val isCompressingPhotos: StateFlow<Boolean> = _isCompressingPhotos.asStateFlow()
    private val _compressProgress = MutableStateFlow(0 to 0)
    val compressProgress: StateFlow<Pair<Int, Int>> = _compressProgress.asStateFlow()
    private val _lastCompressSummary = MutableStateFlow<PhotoCompressSummary?>(null)
    val lastCompressSummary: StateFlow<PhotoCompressSummary?> = _lastCompressSummary.asStateFlow()

    // ─── Smart PDF Compression & Smart Cleanup State ───
    private val _pdfCompressCandidates = MutableStateFlow<List<PdfCompressCandidate>>(emptyList())
    val pdfCompressCandidates: StateFlow<List<PdfCompressCandidate>> = _pdfCompressCandidates.asStateFlow()
    private val _pdfCompressPreset = MutableStateFlow(PdfCompressPreset.BALANCED)
    val pdfCompressPreset: StateFlow<PdfCompressPreset> = _pdfCompressPreset.asStateFlow()
    private val _isCompressingPdfs = MutableStateFlow(false)
    val isCompressingPdfs: StateFlow<Boolean> = _isCompressingPdfs.asStateFlow()
    private val _pdfCompressProgress = MutableStateFlow(0 to 0)
    val pdfCompressProgress: StateFlow<Pair<Int, Int>> = _pdfCompressProgress.asStateFlow()
    private val _lastPdfCompressSummary = MutableStateFlow<PdfCompressSummary?>(null)
    val lastPdfCompressSummary: StateFlow<PdfCompressSummary?> = _lastPdfCompressSummary.asStateFlow()

    private val _cleanerItems = MutableStateFlow<List<CleanerFileItem>>(emptyList())
    val cleanerItems: StateFlow<List<CleanerFileItem>> = _cleanerItems.asStateFlow()

    // ─── Saved E-Signatures State ───
    private val _savedSignatures = MutableStateFlow<List<SavedSignatureItem>>(emptyList())
    val savedSignatures: StateFlow<List<SavedSignatureItem>> = _savedSignatures.asStateFlow()

    // ─── Backup State ───
    private val _isBackupBusy = MutableStateFlow(false)
    val isBackupBusy: StateFlow<Boolean> = _isBackupBusy.asStateFlow()

    // ─── Page Organizer & Scanner State ───
    private val _organizerPages = MutableStateFlow<List<String>>(emptyList())
    val organizerPages: StateFlow<List<String>> = _organizerPages.asStateFlow()
    private val _isOrganizerBusy = MutableStateFlow(false)
    val isOrganizerBusy: StateFlow<Boolean> = _isOrganizerBusy.asStateFlow()
    private val _isSavingPdf = MutableStateFlow(false)
    val isSavingPdf: StateFlow<Boolean> = _isSavingPdf.asStateFlow()

    init {
        viewModelScope.launch { prefs.ensureMachineId() }
        refreshSavedSignatures()
    }

    fun clearToast() { _toastEvent.value = null }
    fun postToast(
        msg: String,
        type: SmartToastType? = null,
        actionLabel: String? = null,
        onAction: (() -> Unit)? = null
    ) {
        if (msg.isNotBlank()) {
            _toastEvent.value = SmartToastClassifier.create(msg, type, actionLabel, onAction)
        }
    }

    fun refreshSavedSignatures() {
        viewModelScope.launch(Dispatchers.IO) {
            _savedSignatures.value = engine.listSavedSignatures()
        }
    }

    fun saveSignatureForReuse(bitmap: Bitmap) {
        viewModelScope.launch {
            engine.saveSignatureBitmap(bitmap)
            refreshSavedSignatures()
        }
    }

    fun deleteSavedSignature(filePath: String) {
        viewModelScope.launch(Dispatchers.IO) {
            if (engine.deleteSavedSignature(filePath)) {
                _savedSignatures.value = engine.listSavedSignatures()
            }
        }
    }

    // ─── Documents & Scanner Operations ───
    fun saveScannedImagesAsPdf(
        imageUris: List<Uri>,
        title: String,
        isCard: Boolean = false,
        cardTag: String = "",
        rotations: List<Int> = emptyList(),
        filters: List<String> = emptyList(),
        quads: List<NormalizedQuad> = emptyList(),
        pageSize: PdfPageSizePreset = PdfPageSizePreset.AUTO,
        qualityPreset: PdfQualityPreset = PdfQualityPreset.BALANCED,
        pdfPassword: String? = null,
        embedOcrTextLayer: Boolean = userPrefs.value.searchablePdfOcrLayer,
        onDone: (FileEntity?) -> Unit = {}
    ) {
        viewModelScope.launch {
            _isSavingPdf.value = true
            try {
                val scanDir = File(app.filesDir, if (isCard) "SmartCards" else "ScannedDocs").apply { mkdirs() }
                val cleanTitle = title.ifBlank { "Scan_${System.currentTimeMillis()}" }.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                val outPdf = File(scanDir, if (cleanTitle.endsWith(".pdf", true)) cleanTitle else "$cleanTitle.pdf")
                val ok = engine.buildPdfFromImages(
                    imageUris = imageUris.map { it.toString() },
                    outputFile = outPdf,
                    rotations = rotations,
                    filters = filters,
                    quads = quads,
                    pageSize = pageSize,
                    qualityPreset = qualityPreset,
                    pdfPassword = pdfPassword,
                    embedOcrTextLayer = embedOcrTextLayer
                )
                if (ok) {
                    val saved = indexer.indexLocalFile(
                        file = outPdf,
                        displayName = outPdf.name,
                        ocrLanguage = userPrefs.value.ocrLanguage,
                        isCard = isCard,
                        customTag = cardTag,
                        isScanned = true
                    )
                    FileSearchWidgetProvider.requestRefresh(app)
                    val ocrBadge = if (embedOcrTextLayer) " · Searchable OCR" else ""
                    val lockSuffix = if (!pdfPassword.isNullOrBlank()) " · Protected" else ""
                    _toastMessage.value = "Saved ${outPdf.name} (${saved?.pageCount ?: imageUris.size} pg)$ocrBadge$lockSuffix"
                    onDone(saved)
                } else {
                    _toastMessage.value = "Failed to build PDF from scan."
                    onDone(null)
                }
            } finally {
                _isSavingPdf.value = false
            }
        }
    }

    fun suggestSmartScanTitle(firstImageUri: Uri, onSuggested: (String) -> Unit) {
        viewModelScope.launch {
            val title = engine.suggestSmartTitleForImage(firstImageUri.toString(), userPrefs.value.ocrLanguage)
            onSuggested(title)
            _toastMessage.value = "Smart Name: $title"
        }
    }

    fun appendScannedImagesToPdf(
        targetPdfUri: String,
        imageUris: List<Uri>,
        rotations: List<Int> = emptyList(),
        filters: List<String> = emptyList(),
        quads: List<NormalizedQuad> = emptyList(),
        onDone: (Boolean) -> Unit = {}
    ) {
        viewModelScope.launch {
            _isSavingPdf.value = true
            try {
                val editable = ensureEditableLocalPdf(targetPdfUri, "Appended")
                if (editable == null) {
                    _toastMessage.value = "Unable to access target PDF."
                    onDone(false)
                    return@launch
                }
                val (outFile, targetUri) = editable
                val ok = engine.appendImagesToPdf(
                    existingPdfUri = targetUri,
                    imageUris = imageUris.map { it.toString() },
                    rotations = rotations,
                    filters = filters,
                    quads = quads,
                    outputFile = outFile
                )
                if (ok) {
                    engine.invalidatePdfCache(targetPdfUri)
                    engine.invalidatePdfCache(targetUri)
                    updatePdfRecordAfterEdit(targetUri, outFile)
                    dao.getFileByUri(targetUri)?.let { rerunOcrForFile(it) }
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    _toastMessage.value = "Appended ${imageUris.size} page(s) to PDF"
                    onDone(true)
                } else {
                    _toastMessage.value = "Failed to append scanned pages."
                    onDone(false)
                }
            } finally {
                _isSavingPdf.value = false
            }
        }
    }

    fun mergeSelectedPdfs(files: List<FileEntity>, outputTitle: String) {
        val pdfs = files.filter { it.extension.equals("pdf", true) }
        if (pdfs.size < 2) {
            _toastMessage.value = "Select at least 2 PDF files to merge."
            return
        }
        viewModelScope.launch {
            val scanDir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val clean = outputTitle.ifBlank { "Merged_${System.currentTimeMillis()}" }.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val outPdf = File(scanDir, if (clean.endsWith(".pdf", true)) clean else "$clean.pdf")
            val ok = engine.mergePdfs(pdfs.map { it.uri }, outPdf)
            if (ok) {
                val saved = indexer.indexLocalFile(outPdf, outPdf.name, userPrefs.value.ocrLanguage, isScanned = true)
                _toastMessage.value = "Merged ${pdfs.size} PDFs → ${outPdf.name} (${saved?.pageCount ?: 1} pg)"
            } else {
                _toastMessage.value = "Failed to merge selected PDFs."
            }
        }
    }

    fun saveIdCard2In1Pdf(
        frontUri: Uri,
        backUri: Uri?,
        tag: String,
        title: String,
        frontRotation: Int = 0,
        backRotation: Int = 0,
        frontFilter: String = "original",
        backFilter: String = "original",
        frontQuad: NormalizedQuad = NormalizedQuad.FULL,
        backQuad: NormalizedQuad = NormalizedQuad.FULL,
        onDone: (FileEntity?) -> Unit = {}
    ) {
        viewModelScope.launch {
            _isSavingPdf.value = true
            try {
                val dir = File(app.filesDir, "SmartCards").apply { mkdirs() }
                val clean = title.ifBlank { "ID_Card_${System.currentTimeMillis()}" }.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                val outPdf = File(dir, "$clean.pdf")
                val ok = engine.buildIdCard2In1Pdf(
                    frontUri = frontUri.toString(),
                    backUri = backUri?.toString(),
                    outputFile = outPdf,
                    frontRotation = frontRotation,
                    backRotation = backRotation,
                    frontFilter = frontFilter,
                    backFilter = backFilter,
                    frontQuad = frontQuad,
                    backQuad = backQuad
                )
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
            } finally {
                _isSavingPdf.value = false
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
            val isPdf = file.extension.equals("pdf", true)
            val dir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val safeName = file.name.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val outFile = File(dir, "wm_${System.currentTimeMillis()}_$safeName")
            val ok = if (isPdf) {
                engine.applyWatermarkToPdf(file.uri, text, colorInt, alpha, outFile)
            } else {
                engine.applyWatermarkToImage(file.uri, text, colorInt, alpha, outFile)
            }
            if (ok) {
                indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage, file.isCard, file.customTag, file.isScanned)
                _toastMessage.value = "Watermarked ${if (isPdf) "PDF" else "copy"} saved: ${outFile.name}"
            } else {
                _toastMessage.value = "Failed to apply watermark."
            }
        }
    }

    fun applyImageSignature(
        file: FileEntity,
        signatureBitmap: Bitmap,
        pageIndex: Int = 0,
        placement: SignaturePlacement = SignaturePlacement()
    ) {
        viewModelScope.launch {
            val isPdf = file.extension.equals("pdf", true)
            val dir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val safeName = file.name.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val outFile = File(dir, "signed_${System.currentTimeMillis()}_$safeName")
            val ok = if (isPdf) {
                engine.applySignatureToPdf(file.uri, pageIndex, signatureBitmap, outFile, placement)
            } else {
                engine.applySignatureToImage(file.uri, signatureBitmap, outFile, placement)
            }
            if (ok) {
                indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage, file.isCard, file.customTag, file.isScanned)
                _toastMessage.value = "Signed ${if (isPdf) "PDF" else "copy"} saved: ${outFile.name}"
            } else {
                _toastMessage.value = "Failed to apply signature."
            }
        }
    }

    fun applyPdfWatermarkByUri(uri: String, title: String, text: String, colorInt: Int, alpha: Float, onSaved: (String) -> Unit = {}) {
        viewModelScope.launch {
            val dir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val clean = title.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "Document" }
            val outFile = File(dir, "wm_${System.currentTimeMillis()}_$clean.pdf")
            if (engine.applyWatermarkToPdf(uri, text, colorInt, alpha, outFile)) {
                indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage, isScanned = true)
                _toastMessage.value = "Watermarked PDF saved: ${outFile.name}"
                onSaved(outFile.toURI().toString())
            } else {
                _toastMessage.value = "Failed to watermark PDF."
            }
        }
    }

    fun applyPdfSignatureByUri(
        uri: String,
        title: String,
        pageIndex: Int,
        signatureBitmap: Bitmap,
        placement: SignaturePlacement = SignaturePlacement(),
        onSaved: (String) -> Unit = {}
    ) {
        viewModelScope.launch {
            val dir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val clean = title.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "Document" }
            val outFile = File(dir, "signed_${System.currentTimeMillis()}_$clean.pdf")
            if (engine.applySignatureToPdf(uri, pageIndex, signatureBitmap, outFile, placement)) {
                indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage, isScanned = true)
                _toastMessage.value = "Signed PDF saved: ${outFile.name}"
                onSaved(outFile.toURI().toString())
            } else {
                _toastMessage.value = "Failed to sign PDF."
            }
        }
    }

    /**
     * Auto-Blur / Privacy Redaction for ID Sharing: creates a temporary redacted JPEG
     * hiding Aadhaar/PAN/Card/Phone numbers via ML Kit OCR and opens the Android share sheet.
     */
    fun shareMaskedDocument(context: android.content.Context, file: FileEntity) {
        viewModelScope.launch {
            val isPdf = file.extension.equals("pdf", true)
            val exportDir = File(app.cacheDir, "exports").apply { mkdirs() }
            val safeBase = file.name.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "document" }
            val outFile = File(exportDir, "${safeBase}_masked_${System.currentTimeMillis()}.jpg")
            val (ok, maskedCount) = engine.redactSensitiveInfoForSharing(file.uri, isPdf, outFile)
            if (ok && outFile.exists()) {
                _toastMessage.value = if (maskedCount > 0) {
                    "Masked $maskedCount sensitive ID field(s) — ready to share"
                } else {
                    "Privacy-checked image ready to share"
                }
                com.filelenspro.app.util.FormatUtils.shareFileOrText(
                    context,
                    outFile.toURI().toString(),
                    "",
                    outFile.name
                )
            } else {
                _toastMessage.value = "Unable to generate masked copy for this file."
            }
        }
    }

    // ─── Multi-Select Search Batch Actions ───
    fun shareBatchAsZip(context: android.content.Context, files: List<FileEntity>) {
        if (files.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            val exportDir = File(app.cacheDir, "exports").apply { mkdirs() }
            val zipFile = File(exportDir, "FileSearchPro_Batch_${System.currentTimeMillis()}.zip")
            var added = 0
            try {
                ZipOutputStream(FileOutputStream(zipFile)).use { zos ->
                    val usedNames = mutableSetOf<String>()
                    files.forEachIndexed { idx, file ->
                        engine.openInputStream(file.uri)?.use { ins ->
                            val uniqueName = if (usedNames.add(file.name)) file.name else "${idx}_${file.name}"
                            zos.putNextEntry(ZipEntry(uniqueName))
                            ins.copyTo(zos)
                            zos.closeEntry()
                            added++
                        }
                    }
                }
                if (added > 0 && zipFile.exists()) {
                    kotlinx.coroutines.withContext(Dispatchers.Main) {
                        _toastMessage.value = "Bundled $added file(s) into ZIP"
                        com.filelenspro.app.util.FormatUtils.shareFileOrText(
                            context,
                            zipFile.toURI().toString(),
                            "",
                            zipFile.name
                        )
                    }
                } else {
                    _toastMessage.value = "Unable to bundle selected files."
                }
            } catch (_: Exception) {
                _toastMessage.value = "Failed to create ZIP archive."
            }
        }
    }

    fun bulkPromoteToCards(files: List<FileEntity>, tag: String) {
        if (files.isEmpty()) return
        viewModelScope.launch(Dispatchers.IO) {
            val cleanTag = tag.ifBlank { "Document" }
            files.forEach { f -> dao.updateCardTag(f.id, true, cleanTag) }
            _toastMessage.value = "Tagged ${files.size} file(s) as Smart Card ($cleanTag)"
        }
    }

    fun compressBatchPhotos(files: List<FileEntity>) {
        val imageExts = setOf("jpg", "jpeg", "png", "webp")
        val photos = files.filter { it.extension.lowercase() in imageExts }
        if (photos.isEmpty()) {
            _toastMessage.value = "No photos in selection to compress."
            return
        }
        viewModelScope.launch {
            val outDir = File(app.filesDir, "ScannedDocs/Compressed").apply { mkdirs() }
            var shrunk = 0
            var savedBytes = 0L
            photos.forEach { photo ->
                val base = photo.name.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "photo" }
                val outFile = File(outDir, "${base}_shrunk_${System.currentTimeMillis()}.jpg")
                val (newSize, reduced) = engine.smartCompressPhoto(photo.uri, photo.size, _compressPreset.value, outFile)
                if (reduced && outFile.exists()) {
                    shrunk++
                    savedBytes += (photo.size - newSize).coerceAtLeast(0L)
                    indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage)
                }
            }
            _toastMessage.value = if (shrunk > 0) {
                "Shrunk $shrunk photo(s) · Saved ${com.filelenspro.app.util.FormatUtils.formatSize(savedBytes)}"
            } else {
                "Selected photos are already optimized"
            }
        }
    }

    fun applyImageFilterOrRotate(file: FileEntity, filter: String, rotationDeg: Int) {
        viewModelScope.launch {
            val existingLocal = com.filelenspro.app.util.FormatUtils.resolveLocalFile(file.uri)
            val writableInPlace = existingLocal != null && existingLocal.exists() && existingLocal.canWrite()
            val target = if (writableInPlace) {
                existingLocal!!
            } else {
                val safeBase = file.name.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "image" }
                File(File(app.filesDir, "ScannedDocs").apply { mkdirs() }, "${safeBase}_edited_${System.currentTimeMillis()}.jpg")
            }
            val ok = engine.applyImageFilterAndRotation(file.uri, filter, rotationDeg, target)
            if (ok && target.exists()) {
                target.setLastModified(System.currentTimeMillis())
                val targetUri = target.toURI().toString()
                if (!writableInPlace) {
                    dao.renameFileRecord(file.id, file.name, targetUri)
                }
                dao.updateDocumentMetadata(file.id, file.pageCount, target.length(), Instant.now().toString())
                _toastMessage.value = "Updated image ($filter${if (rotationDeg != 0) ", rotated $rotationDeg°" else ""})"
            } else {
                _toastMessage.value = "Unable to edit image file."
            }
        }
    }

    // ─── File Manager Operations ───
    fun openFolder(path: String?) {
        _currentFolderPath.value = path
        _folderItems.value = if (path == null) analyzer.getAppRootFolders() else analyzer.listDirectory(path)
    }

    fun refreshFolderRoots() {
        openFolder(_currentFolderPath.value)
    }

    fun navigateUpFolder() {
        val curr = _currentFolderPath.value ?: return
        val appFilesRoot = app.filesDir.absolutePath
        val extRoot = android.os.Environment.getExternalStorageDirectory().absolutePath
        if (curr == extRoot || curr == appFilesRoot) {
            openFolder(null)
            return
        }
        val parent = File(curr).parentFile?.absolutePath
        val inAppVault = parent != null && parent.startsWith(appFilesRoot) && parent != appFilesRoot
        val inExternal = parent != null && (parent == extRoot || parent.startsWith("$extRoot/"))
        if (inAppVault || inExternal) {
            openFolder(parent)
        } else {
            openFolder(null)
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

    fun renameStorageItem(item: StorageItem, newName: String) {
        val trimmed = newName.trim()
        if (trimmed.isBlank()) return
        viewModelScope.launch(Dispatchers.IO) {
            val src = File(item.path)
            if (!src.exists()) return@launch
            val finalName = if (!item.isDirectory && item.extension.isNotBlank() && !trimmed.contains(".")) "$trimmed.${item.extension}" else trimmed
            val dst = File(src.parentFile, finalName)
            if (src.renameTo(dst)) {
                dao.getFileByUri(src.toURI().toString())?.let { rec ->
                    dao.renameFileRecord(rec.id, finalName, dst.toURI().toString())
                }
                openFolder(_currentFolderPath.value)
                _toastMessage.value = "Renamed to $finalName"
            } else {
                _toastMessage.value = "Unable to rename item"
            }
        }
    }

    fun importUrisToCurrentFolder(uris: List<Uri>) {
        if (uris.isEmpty()) return
        val destPath = _currentFolderPath.value ?: File(app.filesDir, "IndexedDocs").apply { mkdirs() }.absolutePath
        viewModelScope.launch(Dispatchers.IO) {
            var count = 0
            uris.forEach { uri ->
                val name = runCatching {
                    app.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                        if (c.moveToFirst()) c.getString(0) else null
                    }
                }.getOrNull() ?: "imported_${System.currentTimeMillis()}_${count}"
                val safeName = name.replace(Regex("[\\\\/:*?\"<>|]"), "_")
                val outFile = File(destPath, safeName)
                app.contentResolver.openInputStream(uri)?.use { ins ->
                    FileOutputStream(outFile).use { outs -> ins.copyTo(outs) }
                }
                if (outFile.exists()) {
                    indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage)
                    count++
                }
            }
            openFolder(_currentFolderPath.value)
            _toastMessage.value = "Imported & indexed $count file(s) into folder"
        }
    }

    fun indexStorageItem(item: StorageItem) {
        if (item.isDirectory) return
        viewModelScope.launch {
            val f = File(item.path)
            if (f.exists()) {
                indexer.indexLocalFile(f, f.name, userPrefs.value.ocrLanguage)
                _toastMessage.value = "Indexed \"${f.name}\" into search"
            }
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

    // ─── Storage Analyser & Smart Photo Compressor Operations ───
    fun runStorageAnalysis() {
        viewModelScope.launch {
            _isAnalyzing.value = true
            val files = dao.getAllFiles()
            _storageAnalysis.value = analyzer.analyzeStorage(files)
            _junkStats.value = analyzer.getJunkCacheStats()
            _duplicates.value = analyzer.findExactDuplicates(files)
            _visualClusters.value = analyzer.findSimilarImages(files)
            _semanticDuplicates.value = SmartTaxonomy.findSemanticDuplicates(files)
            _compressCandidates.value = analyzer.findCompressiblePhotos(files, _compressPreset.value)
            _pdfCompressCandidates.value = analyzer.findCompressiblePdfs(files, _pdfCompressPreset.value)
            val oldDl = analyzer.findOldDownloads(90)
            val apks = analyzer.findLeftoverApks()
            val vids = analyzer.findLargeVideos()
            _cleanerItems.value = oldDl + apks + vids
            _isAnalyzing.value = false
        }
    }

    fun setPdfCompressPreset(preset: PdfCompressPreset) {
        _pdfCompressPreset.value = preset
        _pdfCompressCandidates.value = _pdfCompressCandidates.value.map { item ->
            item.copy(estimatedSavedBytes = (item.sizeBytes * (1f - preset.estimatedRatio)).toLong().coerceAtLeast(0L))
        }
    }

    fun togglePdfCompressCandidate(id: Long) {
        _pdfCompressCandidates.value = _pdfCompressCandidates.value.map {
            if (it.id == id) it.copy(selected = !it.selected) else it
        }
    }

    fun selectAllPdfCompressCandidates(selectAll: Boolean) {
        _pdfCompressCandidates.value = _pdfCompressCandidates.value.map { it.copy(selected = selectAll) }
    }

    fun compressSelectedPdfs(replaceOriginal: Boolean = true) {
        val selected = _pdfCompressCandidates.value.filter { it.selected }
        if (selected.isEmpty()) {
            _toastMessage.value = "Select at least one PDF to compress."
            return
        }
        viewModelScope.launch {
            _isCompressingPdfs.value = true
            _pdfCompressProgress.value = 0 to selected.size
            val preset = _pdfCompressPreset.value
            val outDir = File(app.filesDir, "ScannedDocs/CompressedPdfs").apply { mkdirs() }
            var processed = 0
            var skipped = 0
            var origBytes = 0L
            var newBytes = 0L
            try {
                selected.forEachIndexed { idx, cand ->
                    _pdfCompressProgress.value = (idx + 1) to selected.size
                    val existingLocal = com.filelenspro.app.util.FormatUtils.resolveLocalFile(cand.uri)
                    val canOverwrite = replaceOriginal && existingLocal != null && existingLocal.exists() && existingLocal.canWrite()
                    val base = cand.name.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "document" }
                    val targetFile = if (canOverwrite) {
                        existingLocal!!
                    } else {
                        File(outDir, "${base}_compact_${System.currentTimeMillis()}.pdf")
                    }
                    val (resultSize, reduced) = engine.compressPdf(cand.uri, cand.sizeBytes, preset, targetFile)
                    if (reduced && targetFile.exists()) {
                        processed++
                        origBytes += cand.sizeBytes
                        newBytes += resultSize
                        if (canOverwrite) {
                            dao.updateDocumentMetadata(cand.id, cand.pageCount, resultSize, Instant.now().toString())
                        } else {
                            indexer.indexLocalFile(targetFile, targetFile.name, userPrefs.value.ocrLanguage, isScanned = true)
                        }
                    } else {
                        skipped++
                    }
                }
                val saved = (origBytes - newBytes).coerceAtLeast(0L)
                _lastPdfCompressSummary.value = PdfCompressSummary(processed, skipped, origBytes, newBytes, saved)
                _toastMessage.value = if (processed > 0) {
                    "Compressed $processed PDF(s) · Saved ${com.filelenspro.app.util.FormatUtils.formatSize(saved)}"
                } else {
                    "Selected PDFs are already compact"
                }
                runStorageAnalysis()
            } finally {
                _isCompressingPdfs.value = false
            }
        }
    }

    fun toggleCleanerItem(path: String) {
        _cleanerItems.value = _cleanerItems.value.map {
            if (it.path == path) it.copy(selected = !it.selected) else it
        }
    }

    fun deleteSelectedCleanerItems() {
        val selected = _cleanerItems.value.filter { it.selected }
        if (selected.isEmpty()) {
            _toastMessage.value = "Select at least one item to clean."
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            var freed = 0L
            var removed = 0
            selected.forEach { item ->
                val f = File(item.path)
                if (f.exists() && f.delete()) {
                    freed += item.sizeBytes
                    removed++
                    dao.deleteFileByUri(item.uri)
                }
            }
            _toastMessage.value = "Cleaned $removed item(s) · Freed ${com.filelenspro.app.util.FormatUtils.formatSize(freed)}"
            runStorageAnalysis()
        }
    }

    fun setCompressPreset(preset: PhotoCompressPreset) {
        _compressPreset.value = preset
        _compressCandidates.value = _compressCandidates.value.map { item ->
            item.copy(estimatedSavedBytes = (item.sizeBytes * (1f - preset.estimatedRatio)).toLong().coerceAtLeast(0L))
        }
    }

    fun toggleCompressCandidate(id: Long) {
        _compressCandidates.value = _compressCandidates.value.map {
            if (it.id == id) it.copy(selected = !it.selected) else it
        }
    }

    fun selectAllCompressCandidates(selectAll: Boolean) {
        _compressCandidates.value = _compressCandidates.value.map { it.copy(selected = selectAll) }
    }

    fun compressSelectedPhotos(replaceOriginal: Boolean = true, useWebp: Boolean = false) {
        val selected = _compressCandidates.value.filter { it.selected }
        if (selected.isEmpty()) {
            _toastMessage.value = "Select at least one photo to compress."
            return
        }
        viewModelScope.launch {
            _isCompressingPhotos.value = true
            _compressProgress.value = 0 to selected.size
            val preset = _compressPreset.value
            val outDir = File(app.filesDir, "ScannedDocs/Compressed").apply { mkdirs() }
            var processed = 0
            var skipped = 0
            var origBytes = 0L
            var newBytes = 0L

            try {
                selected.forEachIndexed { idx, candidate ->
                    _compressProgress.value = (idx + 1) to selected.size
                    val existingLocal = com.filelenspro.app.util.FormatUtils.resolveLocalFile(candidate.uri)
                    val canOverwrite = replaceOriginal && existingLocal != null && existingLocal.exists() && existingLocal.canWrite()
                    val ext = if (useWebp) "webp" else "jpg"
                    val base = candidate.name.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "photo" }

                    val targetFile = if (canOverwrite && !useWebp) {
                        existingLocal!!
                    } else if (canOverwrite && useWebp) {
                        File(existingLocal!!.parentFile, "${base}.webp")
                    } else {
                        File(outDir, "${base}_shrunk_${System.currentTimeMillis()}.$ext")
                    }

                    val (resultSize, reduced) = engine.smartCompressPhoto(
                        uriString = candidate.uri,
                        originalSizeBytes = candidate.sizeBytes,
                        preset = preset,
                        outFile = targetFile,
                        useWebp = useWebp
                    )

                    if (reduced && targetFile.exists()) {
                        processed++
                        origBytes += candidate.sizeBytes
                        newBytes += resultSize
                        if (canOverwrite) {
                            if (useWebp && existingLocal != null && existingLocal.absolutePath != targetFile.absolutePath) {
                                existingLocal.delete()
                                dao.renameFileRecord(candidate.id, targetFile.name, targetFile.toURI().toString())
                            }
                            dao.updateDocumentMetadata(candidate.id, 1, resultSize, Instant.now().toString())
                        } else {
                            indexer.indexLocalFile(
                                file = targetFile,
                                displayName = targetFile.name,
                                ocrLanguage = userPrefs.value.ocrLanguage
                            )
                        }
                    } else {
                        skipped++
                    }
                }
                val saved = (origBytes - newBytes).coerceAtLeast(0L)
                _lastCompressSummary.value = PhotoCompressSummary(
                    processedCount = processed,
                    skippedAlreadyOptimal = skipped,
                    originalTotalBytes = origBytes,
                    compressedTotalBytes = newBytes,
                    savedBytes = saved
                )
                _toastMessage.value = if (processed > 0) {
                    "Shrunk $processed photo(s) · Saved ${com.filelenspro.app.util.FormatUtils.formatSize(saved)} with full clarity"
                } else {
                    "All selected photos are already optimized"
                }
                runStorageAnalysis()
            } finally {
                _isCompressingPhotos.value = false
            }
        }
    }

    fun compressExternalPhotoUris(uris: List<Uri>, useWebp: Boolean = false) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            _isCompressingPhotos.value = true
            _compressProgress.value = 0 to uris.size
            val preset = _compressPreset.value
            val outDir = File(app.filesDir, "ScannedDocs/Compressed").apply { mkdirs() }
            var processed = 0
            var skipped = 0
            var origBytes = 0L
            var newBytes = 0L

            try {
                uris.forEachIndexed { idx, uri ->
                    _compressProgress.value = (idx + 1) to uris.size
                    val meta = kotlinx.coroutines.withContext(Dispatchers.IO) {
                        var displayName = "photo_${System.currentTimeMillis()}_$idx.jpg"
                        var size = 0L
                        runCatching {
                            app.contentResolver.query(
                                uri,
                                arrayOf(android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE),
                                null, null, null
                            )?.use { c ->
                                if (c.moveToFirst()) {
                                    displayName = c.getString(0) ?: displayName
                                    size = c.getLong(1)
                                }
                            }
                        }
                        displayName to size
                    }
                    val ext = if (useWebp) "webp" else "jpg"
                    val base = meta.first.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "photo" }
                    val outFile = File(outDir, "${base}_smart_${System.currentTimeMillis()}.$ext")
                    val (resultSize, reduced) = engine.smartCompressPhoto(
                        uriString = uri.toString(),
                        originalSizeBytes = meta.second,
                        preset = preset,
                        outFile = outFile,
                        useWebp = useWebp
                    )
                    if (reduced && outFile.exists()) {
                        processed++
                        origBytes += if (meta.second > 0L) meta.second else resultSize
                        newBytes += resultSize
                        indexer.indexLocalFile(outFile, outFile.name, userPrefs.value.ocrLanguage)
                    } else {
                        skipped++
                    }
                }
                val saved = (origBytes - newBytes).coerceAtLeast(0L)
                _lastCompressSummary.value = PhotoCompressSummary(
                    processedCount = processed,
                    skippedAlreadyOptimal = skipped,
                    originalTotalBytes = origBytes,
                    compressedTotalBytes = newBytes,
                    savedBytes = saved
                )
                _toastMessage.value = if (processed > 0) {
                    "Compressed $processed gallery photo(s) · Saved ${com.filelenspro.app.util.FormatUtils.formatSize(saved)}"
                } else {
                    "Selected gallery photos are already compact"
                }
                runStorageAnalysis()
            } finally {
                _isCompressingPhotos.value = false
            }
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
    private suspend fun ensureEditableLocalPdf(pdfUri: String, fallbackName: String = "Document"): Pair<File, String>? {
        val existing = com.filelenspro.app.util.FormatUtils.resolveLocalFile(pdfUri)
        if (existing != null && existing.exists() && existing.canWrite()) {
            return existing to pdfUri
        }
        val scanDir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
        val dbRec = dao.getFileByUri(pdfUri)
        val rawTitle = (dbRec?.name ?: fallbackName).substringBeforeLast('.')
        val clean = rawTitle.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "Document" }
        val destFile = File(scanDir, "${clean}_edit_${System.currentTimeMillis()}.pdf")
        val copied = kotlinx.coroutines.withContext(Dispatchers.IO) {
            try {
                engine.openInputStream(pdfUri)?.use { ins ->
                    FileOutputStream(destFile).use { outs -> ins.copyTo(outs) }
                }
                destFile.exists() && destFile.length() > 0L
            } catch (_: Exception) {
                false
            }
        }
        if (!copied) return null
        val editableUri = destFile.toURI().toString()
        if (dbRec != null) {
            dao.renameFileRecord(dbRec.id, dbRec.name, editableUri)
        } else {
            indexer.indexLocalFile(destFile, destFile.name, userPrefs.value.ocrLanguage, isScanned = true)
        }
        return destFile to editableUri
    }

    fun loadOrganizerPages(pdfUri: String, forceRefresh: Boolean = false) {
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            _organizerPages.value = engine.renderPdfToImages(pdfUri, limit = 80, maxDim = 900, forceRefresh = forceRefresh)
            _isOrganizerBusy.value = false
        }
    }

    fun rotateOrganizerPages(
        pdfUri: String,
        indices: Set<Int>,
        degrees: Int,
        onUriChanged: (String) -> Unit = {}
    ) {
        if (indices.isEmpty()) return
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            try {
                val editable = ensureEditableLocalPdf(pdfUri)
                if (editable == null) {
                    _toastMessage.value = "Unable to access PDF for rotation."
                    return@launch
                }
                val (local, targetUri) = editable
                val map = indices.associateWith { degrees }
                if (engine.rotatePdfPages(targetUri, map, local)) {
                    engine.invalidatePdfCache(pdfUri)
                    engine.invalidatePdfCache(targetUri)
                    updatePdfRecordAfterEdit(targetUri, local)
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    if (targetUri != pdfUri) onUriChanged(targetUri)
                    val dirLabel = if (degrees > 0) "90° right" else "90° left"
                    _toastMessage.value = "Rotated ${indices.size} page(s) $dirLabel"
                } else {
                    _toastMessage.value = "Could not rotate PDF page(s) — file may be protected."
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    fun rotatePdfSinglePage(
        pdfUri: String,
        pageIndex: Int,
        degrees: Int,
        onDone: (updatedUri: String?) -> Unit = {}
    ) {
        viewModelScope.launch {
            val editable = ensureEditableLocalPdf(pdfUri)
            if (editable == null) {
                _toastMessage.value = "Unable to access PDF for rotation."
                onDone(null)
                return@launch
            }
            val (local, targetUri) = editable
            if (engine.rotatePdfPages(targetUri, mapOf(pageIndex to degrees), local)) {
                engine.invalidatePdfCache(pdfUri)
                engine.invalidatePdfCache(targetUri)
                updatePdfRecordAfterEdit(targetUri, local)
                _toastMessage.value = "Rotated page ${pageIndex + 1}"
                onDone(targetUri)
            } else {
                _toastMessage.value = "Could not rotate page — PDF may be protected."
                onDone(null)
            }
        }
    }

    fun deleteOrganizerPages(
        pdfUri: String,
        indices: Set<Int>,
        onUriChanged: (String) -> Unit = {}
    ) {
        if (indices.isEmpty()) return
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            try {
                val editable = ensureEditableLocalPdf(pdfUri)
                if (editable == null) {
                    _toastMessage.value = "Unable to access PDF for deletion."
                    return@launch
                }
                val (local, targetUri) = editable
                if (engine.deletePdfPages(targetUri, indices, local)) {
                    engine.invalidatePdfCache(pdfUri)
                    engine.invalidatePdfCache(targetUri)
                    updatePdfRecordAfterEdit(targetUri, local)
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    if (targetUri != pdfUri) onUriChanged(targetUri)
                    _toastMessage.value = "Deleted ${indices.size} page(s)"
                } else {
                    _toastMessage.value = "Cannot delete all pages from a PDF"
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    fun moveOrganizerPage(
        pdfUri: String,
        fromIndex: Int,
        toIndex: Int,
        onUriChanged: (String) -> Unit = {}
    ) {
        val count = _organizerPages.value.size
        if (fromIndex !in 0 until count || toIndex !in 0 until count || fromIndex == toIndex) return
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            try {
                val editable = ensureEditableLocalPdf(pdfUri)
                if (editable == null) {
                    _toastMessage.value = "Unable to access PDF for reordering."
                    return@launch
                }
                val (local, targetUri) = editable
                val order = (0 until count).toMutableList()
                val moved = order.removeAt(fromIndex)
                order.add(toIndex, moved)
                if (engine.reorderPdfPages(targetUri, order, local)) {
                    engine.invalidatePdfCache(pdfUri)
                    engine.invalidatePdfCache(targetUri)
                    updatePdfRecordAfterEdit(targetUri, local)
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    if (targetUri != pdfUri) onUriChanged(targetUri)
                } else {
                    _toastMessage.value = "Failed to reorder pages."
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    fun duplicateOrganizerPage(
        pdfUri: String,
        pageIndex: Int,
        onUriChanged: (String) -> Unit = {}
    ) {
        val count = _organizerPages.value.size
        if (pageIndex !in 0 until count) return
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            try {
                val editable = ensureEditableLocalPdf(pdfUri)
                if (editable == null) {
                    _toastMessage.value = "Unable to access PDF."
                    return@launch
                }
                val (local, targetUri) = editable
                val order = (0 until count).toMutableList()
                order.add(pageIndex + 1, pageIndex)
                if (engine.reorderPdfPages(targetUri, order, local)) {
                    engine.invalidatePdfCache(pdfUri)
                    engine.invalidatePdfCache(targetUri)
                    updatePdfRecordAfterEdit(targetUri, local)
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    if (targetUri != pdfUri) onUriChanged(targetUri)
                    _toastMessage.value = "Duplicated page ${pageIndex + 1}"
                } else {
                    _toastMessage.value = "Failed to duplicate page."
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    fun extractOrganizerPages(pdfUri: String, indices: Set<Int>, baseName: String) {
        if (indices.isEmpty()) return
        viewModelScope.launch {
            val dir = File(app.filesDir, "ScannedDocs").apply { mkdirs() }
            val out = File(dir, "${baseName.substringBeforeLast('.')}_extracted_${System.currentTimeMillis()}.pdf")
            _isOrganizerBusy.value = true
            try {
                if (engine.extractPdfPages(pdfUri, indices.sorted(), out)) {
                    indexer.indexLocalFile(out, out.name, userPrefs.value.ocrLanguage, isScanned = true)
                    _toastMessage.value = "Extracted ${indices.size} page(s) to ${out.name}"
                } else {
                    _toastMessage.value = "Failed to extract selected pages."
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    fun mergeAnotherPdf(
        primaryUri: String,
        secondaryUri: Uri,
        onUriChanged: (String) -> Unit = {}
    ) {
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            try {
                val editable = ensureEditableLocalPdf(primaryUri)
                if (editable == null) {
                    _toastMessage.value = "Unable to access primary PDF for merging."
                    return@launch
                }
                val (local, targetUri) = editable
                val tempOut = File(app.cacheDir, "merged_${System.currentTimeMillis()}.pdf")
                if (engine.mergePdfs(listOf(targetUri, secondaryUri.toString()), tempOut)) {
                    tempOut.copyTo(local, overwrite = true)
                    local.setLastModified(System.currentTimeMillis())
                    tempOut.delete()
                    engine.invalidatePdfCache(primaryUri)
                    engine.invalidatePdfCache(targetUri)
                    updatePdfRecordAfterEdit(targetUri, local)
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    if (targetUri != primaryUri) onUriChanged(targetUri)
                    _toastMessage.value = "Merged PDF pages successfully"
                } else {
                    tempOut.delete()
                    _toastMessage.value = "Failed to merge selected PDF."
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    fun compressPdfInOrganizer(
        pdfUri: String,
        preset: PdfCompressPreset,
        onUriChanged: (String) -> Unit = {}
    ) {
        viewModelScope.launch {
            _isOrganizerBusy.value = true
            try {
                val editable = ensureEditableLocalPdf(pdfUri)
                if (editable == null) {
                    _toastMessage.value = "Unable to access PDF for compression."
                    return@launch
                }
                val (local, targetUri) = editable
                val origSize = local.length()
                val (newSize, reduced) = engine.compressPdf(targetUri, origSize, preset, local)
                if (reduced) {
                    updatePdfRecordAfterEdit(targetUri, local)
                    _organizerPages.value = engine.renderPdfToImages(targetUri, limit = 80, maxDim = 900, forceRefresh = true)
                    if (targetUri != pdfUri) onUriChanged(targetUri)
                    val saved = (origSize - newSize).coerceAtLeast(0L)
                    _toastMessage.value = "Compressed PDF (${preset.label}) · Saved ${com.filelenspro.app.util.FormatUtils.formatSize(saved)}"
                } else {
                    _toastMessage.value = "PDF is already optimal for ${preset.label} preset."
                }
            } finally {
                _isOrganizerBusy.value = false
            }
        }
    }

    private suspend fun updatePdfRecordAfterEdit(pdfUri: String, localFile: File) {
        val count = engine.getPdfPageCount(pdfUri)
        dao.getFileByUri(pdfUri)?.let {
            dao.updateDocumentMetadata(it.id, count, localFile.length(), Instant.now().toString())
        }
    }

    // ─── Settings, Security, Auto-Sync & Encrypted Backup ───
    fun setOcrLanguage(lang: String) { viewModelScope.launch { prefs.setOcrLanguage(lang) } }
    fun setSemanticAiEnabled(enabled: Boolean) { viewModelScope.launch { prefs.setSemanticAiEnabled(enabled) } }
    fun setDarkTheme(enabled: Boolean) { viewModelScope.launch { prefs.setDarkTheme(enabled) } }
    fun setSearchablePdfOcrLayer(enabled: Boolean) { viewModelScope.launch { prefs.setSearchablePdfOcrLayer(enabled) } }

    fun setBiometricCardsLock(enabled: Boolean) {
        viewModelScope.launch {
            prefs.setBiometricCardsLock(enabled)
            _toastMessage.value = if (enabled) "Biometric Lock enabled for Smart Cards" else "Smart Cards lock disabled"
        }
    }

    fun setBiometricAppLock(enabled: Boolean) {
        viewModelScope.launch {
            prefs.setBiometricAppLock(enabled)
            _toastMessage.value = if (enabled) "Full App Biometric Lock enabled" else "Full App Lock disabled"
        }
    }

    fun setAutoBackgroundSync(enabled: Boolean, chargingOnly: Boolean) {
        viewModelScope.launch {
            prefs.setAutoBackgroundSync(enabled, chargingOnly)
            BackgroundSyncScheduler.configure(app, enabled, chargingOnly)
            _toastMessage.value = if (enabled) {
                "Background Auto-Sync active (${if (chargingOnly) "while charging" else "battery-safe"})"
            } else {
                "Background Auto-Sync paused"
            }
        }
    }

    fun exportEncryptedBackup(destUri: Uri, password: String) {
        if (password.length < 4) {
            _toastMessage.value = "Enter a password of at least 4 characters."
            return
        }
        viewModelScope.launch {
            _isBackupBusy.value = true
            try {
                val os = app.contentResolver.openOutputStream(destUri)
                if (os == null) {
                    _toastMessage.value = "Unable to open destination file."
                    return@launch
                }
                val stats = BackupManager.exportEncryptedBackup(os, password, dao, engine.signaturesDir())
                _toastMessage.value = "Encrypted backup saved (${stats.voiceNotes} notes, ${stats.bookmarks} bookmarks, ${stats.signatures} signatures)"
            } catch (e: Exception) {
                _toastMessage.value = "Backup export failed: ${e.message ?: "error"}"
            } finally {
                _isBackupBusy.value = false
            }
        }
    }

    fun importEncryptedBackup(sourceUri: Uri, password: String) {
        if (password.length < 4) {
            _toastMessage.value = "Enter your backup password."
            return
        }
        viewModelScope.launch {
            _isBackupBusy.value = true
            try {
                val ins = app.contentResolver.openInputStream(sourceUri)
                if (ins == null) {
                    _toastMessage.value = "Unable to read backup file."
                    return@launch
                }
                val stats = BackupManager.importEncryptedBackup(ins, password, dao, engine.signaturesDir())
                refreshSavedSignatures()
                FileSearchWidgetProvider.requestRefresh(app)
                _toastMessage.value = "Restored ${stats.voiceNotes} notes, ${stats.bookmarks} bookmarks, ${stats.signatures} signatures"
            } catch (_: javax.crypto.AEADBadTagException) {
                _toastMessage.value = "Incorrect backup password or corrupted file."
            } catch (e: Exception) {
                _toastMessage.value = "Restore failed: ${e.message ?: "invalid backup"}"
            } finally {
                _isBackupBusy.value = false
            }
        }
    }

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
            FileSearchWidgetProvider.requestRefresh(app)
            _toastMessage.value = "Search index cleared. Original device files remain safe."
        }
    }

    fun activateLicense(key: String) {
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
