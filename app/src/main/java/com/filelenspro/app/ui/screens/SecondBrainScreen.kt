package com.filelenspro.app.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddLink
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.EditCalendar
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.db.VoiceNoteEntity
import com.filelenspro.app.data.model.ChecklistItem
import com.filelenspro.app.domain.engine.RecurrenceHelper
import com.filelenspro.app.domain.engine.TemporalExtractor
import com.filelenspro.app.ui.components.CalendarDateFilterDialog
import com.filelenspro.app.ui.components.DocumentPreviewDialog
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.RescheduleNoteDialog
import com.filelenspro.app.ui.components.ScheduleDateTimeHelper
import com.filelenspro.app.ui.components.VoiceNoteConfirmDialog
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.SecondBrainViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.util.UUID

private val QUICK_TEMPLATES = listOf(
    "Reminder" to "Remind me tomorrow at 10am to ",
    "Meeting" to "Meeting today at 4pm with ",
    "Bill Due" to "Pay electricity bill before tomorrow 6pm ",
    "Medicine" to "Take medicine today at 9pm "
)

@Composable
fun SecondBrainScreen(
    viewModel: SecondBrainViewModel,
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current

    val isListening by viewModel.isListening.collectAsState()
    val partialTranscript by viewModel.partialTranscript.collectAsState()
    val activeTab by viewModel.activeTab.collectAsState()
    val query by viewModel.searchQuery.collectAsState()
    val selectedDateFilter by viewModel.selectedDateFilter.collectAsState()
    val filteredNotes by viewModel.filteredNotes.collectAsState()
    val allNotes by viewModel.allNotes.collectAsState()
    val linkableDocs by viewModel.linkableDocs.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val userPrefs by viewModel.userPrefs.collectAsState()
    val pendingConfirmText by viewModel.pendingConfirmText.collectAsState()
    val pendingExtraction by viewModel.pendingExtraction.collectAsState()
    val pendingImageUri by viewModel.pendingAttachedImageUri.collectAsState()
    val statusMsg by viewModel.statusMessage.collectAsState()
    val savedSignatures by toolsViewModel.savedSignatures.collectAsState()

    val bookmarkedUris = remember(bookmarks) { bookmarks.map { it.fileUri }.toSet() }

    var quickInput by remember { mutableStateOf("") }
    var showLanguageDialog by remember { mutableStateOf(false) }
    var showDateFilterCalendar by remember { mutableStateOf(false) }
    var rescheduleTarget by remember { mutableStateOf<VoiceNoteEntity?>(null) }
    var linkDocTarget by remember { mutableStateOf<VoiceNoteEntity?>(null) }
    var addStepTarget by remember { mutableStateOf<VoiceNoteEntity?>(null) }
    var previewLinkedDoc by remember { mutableStateOf<FileEntity?>(null) }
    var watermarkDoc by remember { mutableStateOf<FileEntity?>(null) }
    var signatureDoc by remember { mutableStateOf<Pair<FileEntity, Int>?>(null) }

    LaunchedEffect(statusMsg) {
        statusMsg?.let {
            toolsViewModel.postToast(it)
            viewModel.clearStatusMessage()
        }
    }

    val micPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            viewModel.toggleVoiceRecording()
        } else {
            toolsViewModel.postToast("Microphone permission is needed for offline voice notes.")
        }
    }
    val notifPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { _ -> }

    val imageAttachPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            viewModel.attachImageForNextNote(uri)
            toolsViewModel.postToast("Photo attached to next note")
        }
    }

    val todayCount = remember(allNotes) { allNotes.count { it.temporalClass == "today" } }
    val futureCount = remember(allNotes) { allNotes.count { it.temporalClass == "future" } }
    val histCount = remember(allNotes) { allNotes.count { it.temporalClass == "historical" } }

    val todayIso = remember { LocalDate.now().toString() }
    val tomorrowIso = remember { LocalDate.now().plusDays(1).toString() }
    val yesterdayIso = remember { LocalDate.now().minusDays(1).toString() }

    val pulse = rememberInfiniteTransition(label = "micPulse")
    val micScale by pulse.animateFloat(
        initialValue = 1f,
        targetValue = if (isListening) 1.15f else 1f,
        animationSpec = infiniteRepeatable(tween(650), RepeatMode.Reverse),
        label = "micScale"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        FileLensTopBar(
            title = "Second Brain",
            subtitle = "${allNotes.size} voice notes & action timelines",
            onOpenQuickNav = onOpenQuickNav,
            actions = {
                IconButton(
                    onClick = { showLanguageDialog = true },
                    modifier = Modifier.size(48.dp).testTag("brain_language_btn")
                ) {
                    Icon(Icons.Rounded.Language, contentDescription = "Voice Language", tint = palette.text)
                }
                IconButton(
                    onClick = {
                        if (Build.VERSION.SDK_INT >= 33 &&
                            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        ) {
                            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        viewModel.toggleAwarenessBell()
                    },
                    modifier = Modifier.size(48.dp).testTag("brain_awareness_btn")
                ) {
                    Icon(
                        if (userPrefs.awarenessBellEnabled) Icons.Rounded.NotificationsActive else Icons.Rounded.NotificationsNone,
                        contentDescription = "Awareness Bell",
                        tint = if (userPrefs.awarenessBellEnabled) palette.accent else palette.muted
                    )
                }
                IconButton(
                    onClick = { viewModel.toggleMorningDigest() },
                    modifier = Modifier.size(48.dp).testTag("brain_digest_btn")
                ) {
                    Icon(
                        Icons.Rounded.WbSunny,
                        contentDescription = "Morning Daily Digest",
                        tint = if (userPrefs.morningDigestEnabled) palette.warning else palette.muted
                    )
                }
            }
        )

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            // Search & Quick Capture Bar
            Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { viewModel.setSearchQuery(it) },
                        placeholder = { Text("Search voice notes & checklists…") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                        trailingIcon = {
                            if (query.isNotBlank()) {
                                IconButton(onClick = { viewModel.setSearchQuery("") }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Clear")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().testTag("brain_search_input")
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = quickInput,
                            onValueChange = { quickInput = it },
                            placeholder = { Text("e.g. Call doctor tomorrow 5pm…") },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.weight(1f).testTag("brain_quick_note_input")
                        )
                        IconButton(
                            onClick = {
                                viewModel.openManualScheduleNote(quickInput)
                                quickInput = ""
                            },
                            modifier = Modifier.size(44.dp).testTag("brain_manual_calendar_btn")
                        ) {
                            Icon(
                                Icons.Rounded.CalendarMonth,
                                contentDescription = "Schedule Task with Calendar",
                                tint = palette.accent
                            )
                        }
                        IconButton(
                            onClick = {
                                imageAttachPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            modifier = Modifier.size(44.dp).testTag("brain_attach_photo_btn")
                        ) {
                            Icon(
                                Icons.Rounded.AddPhotoAlternate,
                                contentDescription = "Attach Photo",
                                tint = if (pendingImageUri != null) palette.success else palette.muted
                            )
                        }
                        if (quickInput.isNotBlank()) {
                            IconButton(
                                onClick = {
                                    viewModel.prepareNoteConfirmation(quickInput)
                                    quickInput = ""
                                },
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(Brush.linearGradient(listOf(palette.accentGradientStart, palette.accentGradientEnd)))
                                    .testTag("brain_send_note_btn")
                            ) {
                                Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "Extract & Save Note", tint = Color.White)
                            }
                        } else {
                            IconButton(
                                onClick = {
                                    val hasMic = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                                    if (hasMic) {
                                        viewModel.toggleVoiceRecording()
                                    } else {
                                        micPermLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                    }
                                },
                                modifier = Modifier
                                    .size(48.dp)
                                    .scale(micScale)
                                    .clip(CircleShape)
                                    .background(
                                        if (isListening) Brush.linearGradient(listOf(palette.danger, palette.warning))
                                        else Brush.linearGradient(listOf(palette.accentGradientStart, palette.accentGradientEnd))
                                    )
                                    .testTag("brain_mic_btn")
                            ) {
                                Icon(
                                    if (isListening) Icons.Rounded.Stop else Icons.Rounded.Mic,
                                    contentDescription = if (isListening) "Stop Recording" else "Start Voice Capture",
                                    tint = Color.White
                                )
                            }
                        }
                    }

                    // Quick Capture Templates + Manual Calendar Schedule
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AssistChip(
                            onClick = {
                                viewModel.openManualScheduleNote(quickInput)
                                quickInput = ""
                            },
                            leadingIcon = {
                                Icon(Icons.Rounded.CalendarMonth, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
                            },
                            label = { Text("Pick Date & Time") },
                            modifier = Modifier.testTag("brain_quick_schedule_chip")
                        )
                        QUICK_TEMPLATES.forEach { (label, prefix) ->
                            AssistChip(
                                onClick = { quickInput = prefix },
                                label = { Text("+ $label") }
                            )
                        }
                    }

                    if (isListening || partialTranscript.isNotBlank()) {
                        Surface(
                            color = palette.accent.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = partialTranscript.ifBlank { "Listening (${userPrefs.voiceLocale})… Speak naturally" },
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.accent,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }
                }
            }

            // Temporal Tabs
            val tabIndex = when (activeTab) {
                "today" -> 0
                "future" -> 1
                else -> 2
            }
            TabRow(selectedTabIndex = tabIndex, containerColor = palette.surface, contentColor = palette.accent) {
                Tab(selected = tabIndex == 0, onClick = { viewModel.setTab("today") }, text = { Text("Today ($todayCount)") })
                Tab(selected = tabIndex == 1, onClick = { viewModel.setTab("future") }, text = { Text("Upcoming ($futureCount)") })
                Tab(selected = tabIndex == 2, onClick = { viewModel.setTab("historical") }, text = { Text("History ($histCount)") })
            }

            // Date Filter Row (with custom Calendar Date picker)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val isCustomDate = selectedDateFilter != null &&
                    selectedDateFilter != todayIso &&
                    selectedDateFilter != tomorrowIso &&
                    selectedDateFilter != yesterdayIso
                listOf(
                    null to "All Dates",
                    todayIso to "Today",
                    tomorrowIso to "Tomorrow",
                    yesterdayIso to "Yesterday"
                ).forEach { (iso, label) ->
                    FilterChip(
                        selected = selectedDateFilter == iso,
                        onClick = { viewModel.setDateFilter(iso) },
                        label = { Text(label) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = palette.accent,
                            selectedLabelColor = Color.White
                        )
                    )
                }
                FilterChip(
                    selected = isCustomDate,
                    onClick = { showDateFilterCalendar = true },
                    leadingIcon = {
                        Icon(Icons.Rounded.CalendarMonth, contentDescription = null, modifier = Modifier.size(16.dp))
                    },
                    label = {
                        Text(if (isCustomDate) selectedDateFilter!! else "Calendar")
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = palette.accent,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier.testTag("brain_filter_calendar_chip")
                )
            }

            if (filteredNotes.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.Mic, contentDescription = null, tint = palette.dim, modifier = Modifier.size(52.dp))
                        Spacer(Modifier.height(10.dp))
                        Text("Your Second Brain is Clear", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Tap the mic, pick a template, or type a thought — dates, times & action checklists are extracted automatically offline.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted
                        )
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filteredNotes, key = { it.id }) { note ->
                        VoiceNoteCard(
                            note = note,
                            onToggleChecklist = { itemId -> viewModel.toggleChecklistItem(note, itemId) },
                            onAddStep = { addStepTarget = note },
                            onLinkDocument = { linkDocTarget = note },
                            onOpenLinkedDoc = {
                                val doc = linkableDocs.firstOrNull { it.uri == note.linkedDocUri }
                                if (doc != null) previewLinkedDoc = doc
                                else toolsViewModel.postToast("Linked file not found in index")
                            },
                            onCopy = {
                                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                cm.setPrimaryClip(ClipData.newPlainText(note.title, "${note.title}\n${note.rawTranscript}"))
                                toolsViewModel.postToast("Copied note")
                            },
                            onShare = {
                                FormatUtils.shareFileOrText(context, null, "${note.title}\n\n${note.rawTranscript}", note.title)
                            },
                            onReschedule = { rescheduleTarget = note },
                            onDelete = {
                                viewModel.deleteNote(note)
                                toolsViewModel.postToast(
                                    msg = "Deleted \"${note.title.ifBlank { "note" }}\"",
                                    actionLabel = "Undo"
                                ) {
                                    viewModel.restoreNote(note)
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    if (showLanguageDialog) {
        AlertDialog(
            onDismissRequest = { showLanguageDialog = false },
            containerColor = palette.surface,
            title = { Text("Select Voice Language", color = palette.text) },
            text = {
                LazyColumn(modifier = Modifier.height(340.dp)) {
                    items(SecondBrainViewModel.WORLD_LANGUAGES) { lang ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.setVoiceLocale(lang.code)
                                    showLanguageDialog = false
                                }
                                .padding(vertical = 10.dp, horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(lang.flag, style = MaterialTheme.typography.labelLarge, color = palette.accent, modifier = Modifier.width(34.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(lang.name, style = MaterialTheme.typography.bodyLarge, color = palette.text)
                                Text(lang.nativeName, style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                            }
                            if (userPrefs.voiceLocale == lang.code) {
                                Icon(Icons.Rounded.CheckBox, contentDescription = null, tint = palette.accent)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showLanguageDialog = false }) { Text("Done") } }
        )
    }

    linkDocTarget?.let { note ->
        AlertDialog(
            onDismissRequest = { linkDocTarget = null },
            containerColor = palette.surface,
            title = { Text("Link Indexed Document", color = palette.text) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (note.linkedDocUri.isNotBlank()) {
                        TextButton(onClick = {
                            viewModel.linkDocument(note, null)
                            toolsViewModel.postToast("Unlinked document")
                            linkDocTarget = null
                        }) {
                            Text("Remove Current Link (${note.linkedDocName})", color = palette.danger)
                        }
                    }
                    if (linkableDocs.isEmpty()) {
                        Text("No indexed documents available yet.", color = palette.muted)
                    } else {
                        LazyColumn(modifier = Modifier.height(280.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(linkableDocs.take(40), key = { it.id }) { doc ->
                                Surface(
                                    color = palette.surface2,
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.fillMaxWidth().clickable {
                                        viewModel.linkDocument(note, doc)
                                        toolsViewModel.postToast("Linked ${doc.name}")
                                        linkDocTarget = null
                                    }
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        Text(doc.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text("${FormatUtils.formatSize(doc.size)} · ${doc.extension.uppercase()}", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { linkDocTarget = null }) { Text("Close") } }
        )
    }

    addStepTarget?.let { note ->
        var stepText by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { addStepTarget = null },
            containerColor = palette.surface,
            title = { Text("Add Action Step", color = palette.text) },
            text = {
                OutlinedTextField(
                    value = stepText,
                    onValueChange = { stepText = it },
                    label = { Text("Checklist item") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    val clean = stepText.trim()
                    if (clean.isNotBlank()) {
                        val existing = TemporalExtractor.parseChecklist(note.actionItemsJson)
                        val updated = existing + ChecklistItem(UUID.randomUUID().toString(), clean, false)
                        viewModel.updateNoteDetails(note, note.title, note.temporalClass, note.resolvedDatetime, updated)
                    }
                    addStepTarget = null
                }) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { addStepTarget = null }) { Text("Cancel") } }
        )
    }

    if (showDateFilterCalendar) {
        CalendarDateFilterDialog(
            currentIsoDate = selectedDateFilter,
            onDismiss = { showDateFilterCalendar = false },
            onSelectDate = { picked ->
                viewModel.setDateFilter(picked.toString())
                viewModel.setTab(ScheduleDateTimeHelper.classifyTemporalFromDate(picked))
            }
        )
    }

    val confirmText = pendingConfirmText
    val extraction = pendingExtraction
    if (confirmText != null && extraction != null) {
        VoiceNoteConfirmDialog(
            rawText = confirmText,
            extraction = extraction,
            linkableDocs = linkableDocs,
            onDismiss = { viewModel.dismissConfirmation() },
            onSave = { title, transcript, temporalClass, dt, items, rem, doc, recurrenceRule ->
                viewModel.confirmAndSaveNote(title, transcript, temporalClass, dt, items, rem, doc, recurrenceRule)
                val whenStr = if (!dt.isNullOrBlank()) FormatUtils.formatDateTime(dt) else temporalClass
                val rep = if (RecurrenceHelper.isRecurring(recurrenceRule)) " (${RecurrenceHelper.shortLabelFor(recurrenceRule)})" else ""
                toolsViewModel.postToast("Scheduled for $whenStr$rep")
            }
        )
    }

    rescheduleTarget?.let { note ->
        RescheduleNoteDialog(
            note = note,
            onDismiss = { rescheduleTarget = null },
            onSave = { newTitle, newTab, newDt, items, enableReminder, recurrenceRule ->
                viewModel.updateNoteDetails(
                    note = note,
                    newTitle = newTitle,
                    newTemporalClass = newTab,
                    newDateIso = newDt,
                    items = items,
                    enableReminder = enableReminder,
                    showRescheduleToast = true,
                    recurrenceRule = recurrenceRule
                )
                rescheduleTarget = null
            }
        )
    }

    previewLinkedDoc?.let { file ->
        DocumentPreviewDialog(
            file = file,
            searchQuery = "",
            isBookmarked = file.uri in bookmarkedUris,
            engine = toolsViewModel.engine,
            onDismiss = { previewLinkedDoc = null },
            onToggleBookmark = { searchViewModel.toggleBookmark(file) },
            onRerunOcr = { toolsViewModel.rerunOcrForFile(file) },
            onPromoteToCard = { toolsViewModel.promoteFileToCard(file, file.customTag.ifBlank { "Document" }) },
            onOpenWatermark = { watermarkDoc = file },
            onOpenSignature = { pageIdx -> signatureDoc = file to pageIdx },
            onOpenPageOrganizer = {
                previewLinkedDoc = null
                onNavigate(PageOrganizerRoute(file.uri, file.name))
            },
            onApplyFilterOrRotate = { filter, rot -> toolsViewModel.applyImageFilterOrRotate(file, filter, rot) },
            onShareMasked = { toolsViewModel.shareMaskedDocument(context, file) }
        )
    }

    watermarkDoc?.let { doc ->
        DocumentWatermarkDialog(
            onDismiss = { watermarkDoc = null },
            onApply = { text, c, a ->
                toolsViewModel.applyImageWatermark(doc, text, c, a)
                watermarkDoc = null
            }
        )
    }

    signatureDoc?.let { (doc, pageIdx) ->
        DocumentSignatureDialog(
            onDismiss = { signatureDoc = null },
            onApply = { bmp ->
                toolsViewModel.applyImageSignature(doc, bmp, pageIdx)
                signatureDoc = null
            },
            savedSignatures = savedSignatures,
            onSaveSignatureForReuse = { toolsViewModel.saveSignatureForReuse(it) },
            onDeleteSavedSignature = { toolsViewModel.deleteSavedSignature(it) },
            onApplyWithPlacement = { bmp, placement ->
                toolsViewModel.applyImageSignature(doc, bmp, pageIdx, placement)
                signatureDoc = null
            }
        )
    }
}

@Composable
private fun VoiceNoteCard(
    note: VoiceNoteEntity,
    onToggleChecklist: (String) -> Unit,
    onAddStep: () -> Unit,
    onLinkDocument: () -> Unit,
    onOpenLinkedDoc: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onReschedule: () -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val items = remember(note.actionItemsJson) { TemporalExtractor.parseChecklist(note.actionItemsJson) }
    val imgs = remember(note.imageUrisJson) {
        runCatching { Json.decodeFromString<List<String>>(note.imageUrisJson) }.getOrDefault(emptyList())
    }
    val completedCount = items.count { it.completed }
    val progress = if (items.isNotEmpty()) completedCount.toFloat() / items.size.toFloat() else 0f

    val temporalTint = when (note.temporalClass) {
        "today" -> palette.accent
        "future" -> palette.purpleAccent
        else -> palette.muted
    }

    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 2.dp,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(18.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(note.title.ifBlank { "Voice Note" }, style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Surface(
                            color = temporalTint.copy(alpha = 0.13f),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = when (note.temporalClass) {
                                    "today" -> "TODAY"
                                    "future" -> "UPCOMING"
                                    else -> "HISTORY"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = temporalTint,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                            )
                        }
                        Text(
                            FormatUtils.formatDateTime(note.resolvedDatetime ?: note.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.accent
                        )
                        if (note.isReminderSet) {
                            Icon(Icons.Rounded.Alarm, contentDescription = "Reminder Active", tint = palette.warning, modifier = Modifier.size(14.dp))
                        }
                        if (RecurrenceHelper.isRecurring(note.recurrenceRule)) {
                            Surface(
                                color = palette.purpleAccent.copy(alpha = 0.14f),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Icon(Icons.Rounded.Repeat, contentDescription = "Recurring", tint = palette.purpleAccent, modifier = Modifier.size(11.dp))
                                    Text(
                                        RecurrenceHelper.shortLabelFor(note.recurrenceRule),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.purpleAccent,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }
                    }
                }
                IconButton(onClick = onLinkDocument, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Rounded.AddLink, contentDescription = "Link Document", tint = palette.accent)
                }
                IconButton(onClick = onReschedule, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Rounded.EditCalendar, contentDescription = "Edit or Reschedule", tint = palette.muted)
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete Note", tint = palette.danger)
                }
            }

            if (note.rawTranscript.isNotBlank() && note.rawTranscript != note.title) {
                Text(note.rawTranscript, style = MaterialTheme.typography.bodyMedium, color = palette.textSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }

            if (imgs.isNotEmpty()) {
                AsyncImage(
                    model = imgs.first(),
                    contentDescription = "Note Attachment",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
            }

            if (note.linkedDocName.isNotBlank()) {
                Surface(
                    color = palette.accent.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(onClick = onOpenLinkedDoc)
                ) {
                    Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Link, contentDescription = null, tint = palette.accent, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Open linked: ${note.linkedDocName}", style = MaterialTheme.typography.labelLarge, color = palette.accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }

            if (items.isNotEmpty()) {
                LinearProgressIndicator(
                    progress = { progress },
                    color = palette.success,
                    trackColor = palette.surface2,
                    modifier = Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(4.dp))
                )
                items.forEach { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onToggleChecklist(item.id) }
                            .padding(vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (item.completed) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                            contentDescription = "Toggle Action Item",
                            tint = if (item.completed) palette.success else palette.muted,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            item.text,
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (item.completed) palette.muted else palette.text,
                            textDecoration = if (item.completed) TextDecoration.LineThrough else TextDecoration.None
                        )
                    }
                }
            }

            // Inline Footer Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onAddStep) {
                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Add Step")
                }
                Row {
                    IconButton(onClick = onCopy, modifier = Modifier.size(38.dp)) {
                        Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy Note", tint = palette.muted, modifier = Modifier.size(18.dp))
                    }
                    IconButton(onClick = onShare, modifier = Modifier.size(38.dp)) {
                        Icon(Icons.Rounded.Share, contentDescription = "Share Note", tint = palette.muted, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}
