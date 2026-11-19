package com.filelenspro.app.ui.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.db.VoiceNoteEntity
import com.filelenspro.app.data.model.ChecklistItem
import com.filelenspro.app.data.model.LanguageOption
import com.filelenspro.app.data.model.TemporalExtractionResult
import com.filelenspro.app.domain.engine.EmbeddingEngine
import com.filelenspro.app.domain.engine.TemporalExtractor
import com.filelenspro.app.service.ReminderScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.time.OffsetDateTime
import java.util.Locale

class SecondBrainViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as FileLensApplication
    private val dao = app.database.dao()
    private val prefs = app.preferences
    private val voiceManager = app.voiceCaptureManager
    private val indexer = app.documentIndexer

    val isListening = voiceManager.isListening
    val partialTranscript = voiceManager.partialTranscript

    val allNotes = dao.observeAllVoiceNotes().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val linkableDocs = dao.observeAllFiles().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val userPrefs = prefs.prefsFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), com.filelenspro.app.data.prefs.UserPrefs())

    private val _activeTab = MutableStateFlow("today")
    val activeTab: StateFlow<String> = _activeTab.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedDateFilter = MutableStateFlow<String?>(null)
    val selectedDateFilter: StateFlow<String?> = _selectedDateFilter.asStateFlow()

    private val _pendingConfirmText = MutableStateFlow<String?>(null)
    val pendingConfirmText: StateFlow<String?> = _pendingConfirmText.asStateFlow()

    private val _pendingExtraction = MutableStateFlow<TemporalExtractionResult?>(null)
    val pendingExtraction: StateFlow<TemporalExtractionResult?> = _pendingExtraction.asStateFlow()

    private val _pendingAttachedImageUri = MutableStateFlow<String?>(null)
    val pendingAttachedImageUri: StateFlow<String?> = _pendingAttachedImageUri.asStateFlow()

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

    val filteredNotes: StateFlow<List<VoiceNoteEntity>> = combine(
        allNotes, _activeTab, _searchQuery, _selectedDateFilter
    ) { notes, tab, query, dateFilter ->
        var list = notes.filter { note ->
            if (query.isNotBlank()) true else note.temporalClass == tab
        }
        if (!dateFilter.isNullOrBlank()) {
            list = list.filter { n ->
                (n.resolvedDatetime ?: n.createdAt).startsWith(dateFilter)
            }
        }
        if (query.isNotBlank()) {
            val qLower = query.trim().lowercase(Locale.ROOT)
            val qVec = EmbeddingEngine.generateEmbedding(query)
            list = list.mapNotNull { n ->
                val haystack = "${n.title} ${n.rawTranscript} ${n.actionItemsJson} ${n.linkedDocName}".lowercase(Locale.ROOT)
                val lexHit = haystack.contains(qLower)
                val semSim = EmbeddingEngine.cosineSimilarity(qVec, EmbeddingEngine.generateEmbedding(haystack.take(800)))
                if (lexHit || semSim >= 0.30) n to (if (lexHit) 1.0 else semSim) else null
            }.sortedByDescending { it.second }.map { it.first }
        }
        list
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            voiceManager.finalTranscriptEvents.collect { transcript ->
                prepareNoteConfirmation(transcript)
            }
        }
        viewModelScope.launch {
            voiceManager.errorEvents.collect { err ->
                _statusMessage.value = err
            }
        }
    }

    fun setTab(tab: String) { _activeTab.value = tab }
    fun setSearchQuery(q: String) { _searchQuery.value = q }
    fun setDateFilter(dateIsoPrefix: String?) { _selectedDateFilter.value = dateIsoPrefix }
    fun clearStatusMessage() { _statusMessage.value = null }

    fun setVoiceLocale(code: String) {
        viewModelScope.launch { prefs.setVoiceLocale(code) }
    }

    fun toggleVoiceRecording() {
        if (isListening.value) {
            voiceManager.stopListening()
        } else {
            voiceManager.startListening(userPrefs.value.voiceLocale)
        }
    }

    fun attachImageForNextNote(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            val brainImgDir = File(app.filesDir, "BrainImages").apply { mkdirs() }
            val dest = File(brainImgDir, "brain_img_${System.currentTimeMillis()}.jpg")
            app.contentResolver.openInputStream(uri)?.use { ins ->
                FileOutputStream(dest).use { outs -> ins.copyTo(outs) }
            }
            if (dest.exists()) {
                _pendingAttachedImageUri.value = dest.toURI().toString()
            }
        }
    }

    fun clearPendingAttachedImage() {
        _pendingAttachedImageUri.value = null
    }

    fun prepareNoteConfirmation(rawText: String) {
        val clean = rawText.trim()
        if (clean.isBlank()) return
        val extracted = TemporalExtractor.extractTemporalAndActionItems(clean)
        _pendingConfirmText.value = clean
        _pendingExtraction.value = extracted
    }

    fun dismissConfirmation() {
        _pendingConfirmText.value = null
        _pendingExtraction.value = null
    }

    fun confirmAndSaveNote(
        title: String,
        transcript: String,
        temporalClass: String,
        resolvedDatetime: String?,
        checklistItems: List<ChecklistItem>,
        enableReminder: Boolean,
        linkedDoc: FileEntity? = null
    ) {
        viewModelScope.launch(Dispatchers.IO) {
            val nowIso = Instant.now().toString()
            val noteDir = File(app.filesDir, "VoiceNotes").apply { mkdirs() }
            val noteFile = File(noteDir, "note_${System.currentTimeMillis()}.txt")
            val finalTitle = title.ifBlank {
                checklistItems.firstOrNull()?.text?.take(48) ?: transcript.take(48)
            }
            noteFile.writeText("$finalTitle\n\n$transcript\n\n" + checklistItems.joinToString("\n") { "• ${it.text}" })

            val indexedFile = indexer.indexLocalFile(
                file = noteFile,
                displayName = "$finalTitle.txt",
                ocrLanguage = userPrefs.value.ocrLanguage,
                customTag = "Second Brain"
            )

            val attachedImgs = _pendingAttachedImageUri.value?.let { listOf(it) } ?: emptyList()
            val note = VoiceNoteEntity(
                fileId = indexedFile?.id ?: 0L,
                uri = noteFile.toURI().toString(),
                title = finalTitle,
                rawTranscript = transcript,
                temporalClass = temporalClass,
                resolvedDatetime = resolvedDatetime,
                actionItemsJson = TemporalExtractor.encodeChecklist(checklistItems),
                isReminderSet = enableReminder,
                imageUrisJson = Json.encodeToString(attachedImgs),
                linkedDocUri = linkedDoc?.uri.orEmpty(),
                linkedDocName = linkedDoc?.name.orEmpty(),
                linkedDocType = linkedDoc?.extension.orEmpty(),
                createdAt = nowIso
            )
            val id = dao.insertVoiceNote(note)

            if (enableReminder && !resolvedDatetime.isNullOrBlank()) {
                runCatching {
                    val triggerMillis = OffsetDateTime.parse(resolvedDatetime).toInstant().toEpochMilli()
                    ReminderScheduler.scheduleNotification(
                        app,
                        id.toInt(),
                        triggerMillis,
                        finalTitle,
                        checklistItems.firstOrNull()?.text ?: transcript
                    )
                }
            }

            _pendingConfirmText.value = null
            _pendingExtraction.value = null
            _pendingAttachedImageUri.value = null
            _activeTab.value = temporalClass
        }
    }

    fun toggleChecklistItem(note: VoiceNoteEntity, itemId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val items = TemporalExtractor.parseChecklist(note.actionItemsJson).map {
                if (it.id == itemId) it.copy(completed = !it.completed) else it
            }
            dao.updateVoiceNote(note.copy(actionItemsJson = TemporalExtractor.encodeChecklist(items)))
        }
    }

    fun updateNoteDetails(note: VoiceNoteEntity, newTitle: String, newTemporalClass: String, newDateIso: String?, items: List<ChecklistItem>) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.updateVoiceNote(
                note.copy(
                    title = newTitle.ifBlank { note.title },
                    temporalClass = newTemporalClass,
                    resolvedDatetime = newDateIso,
                    actionItemsJson = TemporalExtractor.encodeChecklist(items)
                )
            )
        }
    }

    fun linkDocument(note: VoiceNoteEntity, doc: FileEntity?) {
        viewModelScope.launch(Dispatchers.IO) {
            dao.updateVoiceNote(
                note.copy(
                    linkedDocUri = doc?.uri.orEmpty(),
                    linkedDocName = doc?.name.orEmpty(),
                    linkedDocType = doc?.extension.orEmpty()
                )
            )
        }
    }

    fun deleteNote(note: VoiceNoteEntity) {
        viewModelScope.launch(Dispatchers.IO) {
            ReminderScheduler.cancelNotification(app, note.id.toInt())
            dao.deleteVoiceNoteById(note.id)
            if (note.fileId > 0) dao.deleteFileById(note.fileId)
        }
    }

    fun toggleAwarenessBell() {
        viewModelScope.launch {
            val next = !userPrefs.value.awarenessBellEnabled
            prefs.setAwarenessBell(next)
            if (next) {
                val todayCount = dao.getVoiceNotesByTemporalClass("today").size
                ReminderScheduler.scheduleNotification(
                    app,
                    7771,
                    System.currentTimeMillis() + 60 * 60 * 1000L,
                    "Day Plan Awareness",
                    "You have $todayCount active Second Brain note(s) scheduled for today."
                )
                _statusMessage.value = "Awareness Bell enabled for today's plans."
            } else {
                ReminderScheduler.cancelNotification(app, 7771)
                _statusMessage.value = "Awareness Bell paused."
            }
        }
    }

    fun toggleMorningDigest() {
        viewModelScope.launch {
            val next = !userPrefs.value.morningDigestEnabled
            prefs.setMorningDigest(next)
            if (next) {
                val cal = java.util.Calendar.getInstance().apply {
                    add(java.util.Calendar.DAY_OF_YEAR, 1)
                    set(java.util.Calendar.HOUR_OF_DAY, 8)
                    set(java.util.Calendar.MINUTE, 0)
                }
                ReminderScheduler.scheduleNotification(
                    app,
                    7772,
                    cal.timeInMillis,
                    "Good Morning · FileLens Second Brain",
                    "Tap to review today's action plan and scheduled reminders."
                )
                _statusMessage.value = "Morning Daily Digest scheduled for 8:00 AM."
            } else {
                ReminderScheduler.cancelNotification(app, 7772)
                _statusMessage.value = "Morning Daily Digest paused."
            }
        }
    }

    companion object {
        val WORLD_LANGUAGES = listOf(
            LanguageOption("hi-IN", "Hindi", "हिन्दी", "IN"),
            LanguageOption("en-IN", "English (India)", "English / Hinglish", "IN"),
            LanguageOption("en-US", "English (US)", "English (US)", "US"),
            LanguageOption("en-GB", "English (UK)", "English (UK)", "GB"),
            LanguageOption("mr-IN", "Marathi", "मराठी", "IN"),
            LanguageOption("bn-IN", "Bengali", "বাংলা", "IN"),
            LanguageOption("te-IN", "Telugu", "తెలుగు", "IN"),
            LanguageOption("ta-IN", "Tamil", "தமிழ்", "IN"),
            LanguageOption("gu-IN", "Gujarati", "ગુજરાતી", "IN"),
            LanguageOption("kn-IN", "Kannada", "ಕನ್ನಡ", "IN"),
            LanguageOption("pa-IN", "Punjabi", "ਪੰਜਾਬੀ", "IN"),
            LanguageOption("es-ES", "Spanish", "Español", "ES"),
            LanguageOption("fr-FR", "French", "Français", "FR"),
            LanguageOption("de-DE", "German", "Deutsch", "DE"),
            LanguageOption("ja-JP", "Japanese", "日本語", "JP"),
            LanguageOption("ar-SA", "Arabic", "العربية", "SA")
        )
    }
}
