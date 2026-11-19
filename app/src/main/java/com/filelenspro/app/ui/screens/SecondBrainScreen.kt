package com.filelenspro.app.ui.screens

import android.Manifest
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Alarm
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.EditCalendar
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
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
import com.filelenspro.app.data.db.VoiceNoteEntity
import com.filelenspro.app.domain.engine.TemporalExtractor
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.RescheduleNoteDialog
import com.filelenspro.app.ui.components.VoiceNoteConfirmDialog
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SecondBrainViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import kotlinx.serialization.json.Json

@Composable
fun SecondBrainScreen(
    viewModel: SecondBrainViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current

    val isListening by viewModel.isListening.collectAsState()
    val partialTranscript by viewModel.partialTranscript.collectAsState()
    val activeTab by viewModel.activeTab.collectAsState()
    val query by viewModel.searchQuery.collectAsState()
    val filteredNotes by viewModel.filteredNotes.collectAsState()
    val allNotes by viewModel.allNotes.collectAsState()
    val linkableDocs by viewModel.linkableDocs.collectAsState()
    val userPrefs by viewModel.userPrefs.collectAsState()
    val pendingConfirmText by viewModel.pendingConfirmText.collectAsState()
    val pendingExtraction by viewModel.pendingExtraction.collectAsState()
    val pendingImageUri by viewModel.pendingAttachedImageUri.collectAsState()
    val statusMsg by viewModel.statusMessage.collectAsState()

    var quickInput by remember { mutableStateOf("") }
    var showLanguageDialog by remember { mutableStateOf(false) }
    var rescheduleTarget by remember { mutableStateOf<VoiceNoteEntity?>(null) }

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
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { viewModel.setSearchQuery(it) },
                        placeholder = { Text("Search voice notes & checklists…") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
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
                                imageAttachPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            modifier = Modifier.size(48.dp).testTag("brain_attach_photo_btn")
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
                                    .background(palette.accent)
                                    .testTag("brain_send_note_btn")
                            ) {
                                Icon(Icons.Rounded.Send, contentDescription = "Extract & Save Note", tint = Color.White)
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
                                    .background(if (isListening) palette.danger else palette.accent)
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

            if (filteredNotes.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.Mic, contentDescription = null, tint = palette.dim, modifier = Modifier.size(52.dp))
                        Spacer(Modifier.height(10.dp))
                        Text("Your Second Brain is Clear", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Tap the mic or type a thought — dates, times & action checklists are extracted automatically offline.",
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
                            onReschedule = { rescheduleTarget = note },
                            onDelete = { viewModel.deleteNote(note) }
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

    val confirmText = pendingConfirmText
    val extraction = pendingExtraction
    if (confirmText != null && extraction != null) {
        VoiceNoteConfirmDialog(
            rawText = confirmText,
            extraction = extraction,
            linkableDocs = linkableDocs,
            onDismiss = { viewModel.dismissConfirmation() },
            onSave = { title, transcript, temporalClass, dt, items, rem, doc ->
                viewModel.confirmAndSaveNote(title, transcript, temporalClass, dt, items, rem, doc)
                toolsViewModel.postToast("Note saved to Second Brain")
            }
        )
    }

    rescheduleTarget?.let { note ->
        RescheduleNoteDialog(
            note = note,
            onDismiss = { rescheduleTarget = null },
            onSave = { newTitle, newTab, newDt, items ->
                viewModel.updateNoteDetails(note, newTitle, newTab, newDt, items)
                rescheduleTarget = null
            }
        )
    }
}

@Composable
private fun VoiceNoteCard(
    note: VoiceNoteEntity,
    onToggleChecklist: (String) -> Unit,
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

    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(note.title.ifBlank { "Voice Note" }, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            FormatUtils.formatDateTime(note.resolvedDatetime ?: note.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.accent
                        )
                        if (note.isReminderSet) {
                            Icon(Icons.Rounded.Alarm, contentDescription = "Reminder Active", tint = palette.warning, modifier = Modifier.size(14.dp))
                        }
                    }
                }
                IconButton(onClick = onReschedule, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Rounded.EditCalendar, contentDescription = "Edit or Reschedule", tint = palette.muted)
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(40.dp)) {
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
                Surface(color = palette.surface2, shape = RoundedCornerShape(8.dp)) {
                    Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Link, contentDescription = null, tint = palette.accent, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(note.linkedDocName, style = MaterialTheme.typography.labelSmall, color = palette.text)
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
        }
    }
}
