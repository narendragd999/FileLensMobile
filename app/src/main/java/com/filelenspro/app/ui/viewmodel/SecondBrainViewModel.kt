package com.filelenspro.app.ui.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.db.VoiceNoteEntity
import com.filelenspro.app.data.model.ChecklistItem
import com.filelenspro.app.data.model.ExpiryRadarItem
import com.filelenspro.app.data.model.LanguageOption
import com.filelenspro.app.data.model.TemporalExtractionResult
import com.filelenspro.app.domain.engine.EmbeddingEngine
import com.filelenspro.app.domain.engine.RecurrenceHelper
import com.filelenspro.app.domain.engine.TemporalExtractor
import com.filelenspro.app.service.ReminderScheduler
import com.filelenspro.app.widget.FileSearchWidgetProvider
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

    fun openManualScheduleNote(initialText: String = "") {
        val clean = initialText.trim()
        val extracted = if (clean.isNotBlank()) {
            TemporalExtractor.extractTemporalAndActionItems(clean)
        } else {
            val defaultDt = java.time.LocalDateTime.now()
                .plusHours(1)
                .withMinute(0)
                .withSecond(0)
                .withNano(0)
                .atZone(java.time.ZoneId.systemDefault())
                .toOffsetDateTime()
                .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            TemporalExtractionResult(
                temporalClass = "today",
                resolvedDatetime = defaultDt,
                actionItems = emptyList(),
                checklistItems = emptyList(),
                isHighConfidenceReminder = true
            )
        }
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
        linkedDoc: FileEntity? = null,
        recurrenceRule: String = RecurrenceHelper.NONE
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

            val normRule = RecurrenceHelper.normalize(recurrenceRule)
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
                createdAt = nowIso,
                recurrenceRule = normRule
            )
            val id = dao.insertVoiceNote(note)

            if (enableReminder && !resolvedDatetime.isNullOrBlank()) {
                runCatching {
                    val triggerMillis = OffsetDateTime.parse(resolvedDatetime).toInstant().toEpochMilli()
                    ReminderScheduler.scheduleNotification(
                        context = app,
                        id = id.toInt(),
                        triggerAtMillis = triggerMillis,
                        title = finalTitle,
                        message = checklistItems.firstOrNull()?.text ?: transcript,
                        noteId = id,
                        recurrenceRule = normRule
                    )
                }
            }

            FileSearchWidgetProvider.requestRefresh(app)
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

    fun updateNoteDetails(
        note: VoiceNoteEntity,
        newTitle: String,
        newTemporalClass: String,
        newDateIso: String?,
        items: List<ChecklistItem>,
        enableReminder: Boolean = note.isReminderSet,
        showRescheduleToast: Boolean = false,
        recurrenceRule: String = note.recurrenceRule
    ) {
        viewModelScope.launch(Dispatchers.IO) {
            val finalTitle = newTitle.ifBlank { note.title }
            val normRule = RecurrenceHelper.normalize(recurrenceRule)
            val updated = note.copy(
                title = finalTitle,
                temporalClass = newTemporalClass,
                resolvedDatetime = newDateIso,
                actionItemsJson = TemporalExtractor.encodeChecklist(items),
                isReminderSet = enableReminder,
                recurrenceRule = normRule
            )
            dao.updateVoiceNote(updated)

            ReminderScheduler.cancelNotification(app, note.id.toInt())
            if (enableReminder && !newDateIso.isNullOrBlank()) {
                runCatching {
                    val triggerMillis = OffsetDateTime.parse(newDateIso).toInstant().toEpochMilli()
                    if (triggerMillis > System.currentTimeMillis()) {
                        ReminderScheduler.scheduleNotification(
                            context = app,
                            id = note.id.toInt(),
                            triggerAtMillis = triggerMillis,
                            title = finalTitle,
                            message = items.firstOrNull()?.text ?: note.rawTranscript,
                            noteId = note.id,
                            recurrenceRule = normRule
                        )
                    }
                }
            }
            FileSearchWidgetProvider.requestRefresh(app)
            if (showRescheduleToast) {
                val formatted = if (!newDateIso.isNullOrBlank()) {
                    com.filelenspro.app.util.FormatUtils.formatDateTime(newDateIso)
                } else {
                    newTemporalClass
                }
                val repeatNote = if (RecurrenceHelper.isRecurring(normRule)) " (${RecurrenceHelper.shortLabelFor(normRule)})" else ""
                _statusMessage.value = "Rescheduled \"$finalTitle\" to $formatted$repeatNote"
                _activeTab.value = newTemporalClass
            }
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
            FileSearchWidgetProvider.requestRefresh(app)
        }
    }

    fun restoreNote(note: VoiceNoteEntity) {
        viewModelScope.launch(Dispatchers.IO) {
            val id = dao.insertVoiceNote(note.copy(id = 0L))
            if (note.isReminderSet && !note.resolvedDatetime.isNullOrBlank()) {
                runCatching {
                    val triggerMillis = OffsetDateTime.parse(note.resolvedDatetime).toInstant().toEpochMilli()
                    if (triggerMillis > System.currentTimeMillis()) {
                        ReminderScheduler.scheduleNotification(
                            context = app,
                            id = id.toInt(),
                            triggerAtMillis = triggerMillis,
                            title = note.title,
                            message = note.rawTranscript.take(120),
                            noteId = id,
                            recurrenceRule = note.recurrenceRule
                        )
                    }
                }
            }
            FileSearchWidgetProvider.requestRefresh(app)
            _statusMessage.value = "Restored \"${note.title}\""
        }
    }

    /**
     * Proactive Expiry Radar: schedules 30-day, 7-day, and 1-day renewal alerts in Second Brain
     * linked directly to the expiring document.
     */
    fun scheduleExpiryRenewalAlerts(item: ExpiryRadarItem, onScheduled: (Int) -> Unit = {}) {
        viewModelScope.launch(Dispatchers.IO) {
            val expiryDate = runCatching { java.time.LocalDate.parse(item.expiryDateIso) }.getOrNull() ?: return@launch
            val today = java.time.LocalDate.now()
            val offsets = listOf(30L to "30 days left", 7L to "7 days left", 1L to "Expires tomorrow")
            var created = 0
            offsets.forEach { (daysBefore, label) ->
                val alertDate = expiryDate.minusDays(daysBefore)
                if (!alertDate.isBefore(today)) {
                    val alertDt = alertDate.atTime(9, 0)
                    val iso = alertDt.atZone(java.time.ZoneId.systemDefault())
                        .toOffsetDateTime()
                        .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                    val tClass = if (alertDate.isEqual(today)) "today" else "future"
                    val title = "Renew ${item.docType}: ${item.file.name.substringBeforeLast('.')} ($label)"
                    val note = VoiceNoteEntity(
                        uri = "expiry://${item.file.id}/${daysBefore}_${System.currentTimeMillis()}",
                        title = title,
                        rawTranscript = "${item.docType} expires on ${item.expiryDateIso}. ${item.matchedContext}",
                        temporalClass = tClass,
                        resolvedDatetime = iso,
                        actionItemsJson = TemporalExtractor.encodeChecklist(
                            listOf(ChecklistItem(id = "exp_${daysBefore}", text = "Renew ${item.docType} before ${item.expiryDateIso}"))
                        ),
                        isReminderSet = true,
                        linkedDocUri = item.file.uri,
                        linkedDocName = item.file.name,
                        linkedDocType = item.file.extension,
                        createdAt = Instant.now().toString()
                    )
                    val id = dao.insertVoiceNote(note)
                    val triggerMillis = alertDt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                    if (triggerMillis > System.currentTimeMillis()) {
                        ReminderScheduler.scheduleNotification(
                            context = app,
                            id = id.toInt(),
                            triggerAtMillis = triggerMillis,
                            title = title,
                            message = "Expires ${item.expiryDateIso} · Tap to view linked document",
                            noteId = id
                        )
                    }
                    created++
                }
            }
            if (created == 0) {
                // Already expired or expires today: create an immediate Today renewal task
                val todayDt = java.time.LocalDateTime.now().plusHours(1).withSecond(0).withNano(0)
                val iso = todayDt.atZone(java.time.ZoneId.systemDefault())
                    .toOffsetDateTime()
                    .format(java.time.format.DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                val title = "Urgent Renewal: ${item.docType} (${item.expiryDateIso})"
                val note = VoiceNoteEntity(
                    uri = "expiry://${item.file.id}/urgent_${System.currentTimeMillis()}",
                    title = title,
                    rawTranscript = "${item.docType} expired/expiring on ${item.expiryDateIso}.",
                    temporalClass = "today",
                    resolvedDatetime = iso,
                    isReminderSet = true,
                    linkedDocUri = item.file.uri,
                    linkedDocName = item.file.name,
                    linkedDocType = item.file.extension,
                    createdAt = Instant.now().toString()
                )
                val id = dao.insertVoiceNote(note)
                ReminderScheduler.scheduleNotification(
                    context = app,
                    id = id.toInt(),
                    triggerAtMillis = todayDt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(),
                    title = title,
                    message = "Renew ${item.file.name}",
                    noteId = id
                )
                created = 1
            }
            FileSearchWidgetProvider.requestRefresh(app)
            kotlinx.coroutines.withContext(Dispatchers.Main) { onScheduled(created) }
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
