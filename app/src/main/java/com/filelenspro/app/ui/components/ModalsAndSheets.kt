package com.filelenspro.app.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint as AndroidPaint
import android.graphics.Path as AndroidPath
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.IntOffset
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.db.VoiceNoteEntity
import com.filelenspro.app.data.model.ChecklistItem
import com.filelenspro.app.data.model.SavedSignatureItem
import com.filelenspro.app.data.model.SearchFilters
import com.filelenspro.app.data.model.SignaturePlacement
import com.filelenspro.app.data.model.TemporalExtractionResult
import com.filelenspro.app.domain.engine.RecurrenceHelper
import com.filelenspro.app.domain.engine.TemporalExtractor
import com.filelenspro.app.ui.theme.LocalFileLensColors
import kotlin.math.roundToInt
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SearchFilterSheet(
    current: SearchFilters,
    onDismiss: () -> Unit,
    onApply: (SearchFilters) -> Unit
) {
    val palette = LocalFileLensColors.current
    var types by remember { mutableStateOf(current.fileTypes) }
    var minSize by remember { mutableStateOf(current.minSizeBytes) }
    var maxSize by remember { mutableStateOf(current.maxSizeBytes) }
    var datePreset by remember { mutableStateOf(current.modifiedAfterIso) }

    val typeOptions = listOf("PDFs", "Images", "Documents", "Audio", "Video")
    val sizePresets = listOf(
        "Any" to (null to null),
        "< 1 MB" to (null to 1_048_576L),
        "1–10 MB" to (1_048_576L to 10_485_760L),
        "> 10 MB" to (10_485_760L to null)
    )

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = palette.surface) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Search Filters", style = MaterialTheme.typography.titleLarge, color = palette.text)
            Text("File Categories", style = MaterialTheme.typography.labelLarge, color = palette.muted)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                typeOptions.forEach { t ->
                    FilterChip(
                        selected = t in types,
                        onClick = { types = if (t in types) types - t else types + t },
                        label = { Text(t) }
                    )
                }
            }
            Text("File Size", style = MaterialTheme.typography.labelLarge, color = palette.muted)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                sizePresets.forEach { (label, pair) ->
                    val selected = minSize == pair.first && maxSize == pair.second
                    FilterChip(
                        selected = selected,
                        onClick = { minSize = pair.first; maxSize = pair.second },
                        label = { Text(label) }
                    )
                }
            }
            Text("Modified Window", style = MaterialTheme.typography.labelLarge, color = palette.muted)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val now = LocalDate.now()
                listOf(
                    "Any Time" to null,
                    "Last 7 Days" to now.minusDays(7).toString(),
                    "Last 30 Days" to now.minusDays(30).toString()
                ).forEach { (label, iso) ->
                    FilterChip(
                        selected = datePreset == iso,
                        onClick = { datePreset = iso },
                        label = { Text(label) }
                    )
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = { onApply(SearchFilters()); onDismiss() },
                    modifier = Modifier.weight(1f)
                ) { Text("Reset") }
                Button(
                    onClick = {
                        onApply(SearchFilters(types, minSize, maxSize, datePreset))
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f).testTag("apply_filters_btn")
                ) { Text("Apply Filters") }
            }
        }
    }
}

@Composable
fun DocumentWatermarkDialog(
    onDismiss: () -> Unit,
    onApply: (text: String, colorInt: Int, alpha: Float) -> Unit
) {
    val palette = LocalFileLensColors.current
    var text by remember { mutableStateOf("CONFIDENTIAL") }
    var opacity by remember { mutableFloatStateOf(0.35f) }
    var colorChoice by remember { mutableIntStateOf(AndroidColor.RED) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = { Text("Add Diagonal Watermark", color = palette.text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text("Watermark Text") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "Red" to AndroidColor.RED,
                        "Blue" to AndroidColor.BLUE,
                        "Slate" to AndroidColor.DKGRAY
                    ).forEach { (label, c) ->
                        FilterChip(selected = colorChoice == c, onClick = { colorChoice = c }, label = { Text(label) })
                    }
                }
                Text("Opacity: ${(opacity * 100).toInt()}%", style = MaterialTheme.typography.labelLarge, color = palette.muted)
                Slider(value = opacity, onValueChange = { opacity = it }, valueRange = 0.1f..0.85f)
            }
        },
        confirmButton = {
            Button(onClick = { onApply(text.ifBlank { "CONFIDENTIAL" }, colorChoice, opacity) }) { Text("Stamp Copy") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun DocumentSignatureDialog(
    onDismiss: () -> Unit,
    onApply: (Bitmap) -> Unit = {},
    savedSignatures: List<SavedSignatureItem> = emptyList(),
    onSaveSignatureForReuse: ((Bitmap) -> Unit)? = null,
    onDeleteSavedSignature: ((String) -> Unit)? = null,
    onApplyWithPlacement: ((Bitmap, SignaturePlacement) -> Unit)? = null
) {
    val palette = LocalFileLensColors.current
    val strokes = remember { mutableStateListOf<List<Offset>>() }
    var currentStroke by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var canvasSize by remember { mutableStateOf(IntSize(600, 240)) }
    var selectedSavedPath by remember { mutableStateOf<String?>(null) }
    var saveForReuse by remember { mutableStateOf(true) }
    var includeDateStamp by remember { mutableStateOf(true) }
    var posX by remember { mutableFloatStateOf(0.58f) }
    var posY by remember { mutableFloatStateOf(0.76f) }
    var widthFraction by remember { mutableFloatStateOf(0.32f) }
    var previewBoxSize by remember { mutableStateOf(IntSize(400, 220)) }

    val selectedSavedBmp = remember(selectedSavedPath) {
        selectedSavedPath?.let { runCatching { BitmapFactory.decodeFile(it) }.getOrNull() }
    }
    val hasSignature = selectedSavedBmp != null || strokes.isNotEmpty()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = { Text("E-Signature & Placement", color = palette.text, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (savedSignatures.isNotEmpty()) {
                    Text(
                        "Saved Signatures (1-tap reuse)",
                        style = MaterialTheme.typography.labelLarge,
                        color = palette.muted
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        savedSignatures.forEach { item ->
                            val isSel = selectedSavedPath == item.filePath
                            val thumb = remember(item.filePath) {
                                runCatching { BitmapFactory.decodeFile(item.filePath) }.getOrNull()
                            }
                            if (thumb != null) {
                                Box(
                                    modifier = Modifier
                                        .size(width = 110.dp, height = 56.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(Color.White)
                                        .border(
                                            width = if (isSel) 2.5.dp else 1.dp,
                                            color = if (isSel) palette.accent else palette.border,
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .clickable {
                                            selectedSavedPath = if (isSel) null else item.filePath
                                        }
                                        .padding(4.dp)
                                ) {
                                    Image(
                                        bitmap = thumb.asImageBitmap(),
                                        contentDescription = item.name,
                                        modifier = Modifier.matchParentSize()
                                    )
                                    if (onDeleteSavedSignature != null) {
                                        Box(
                                            modifier = Modifier
                                                .align(Alignment.TopEnd)
                                                .size(20.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(palette.danger.copy(alpha = 0.85f))
                                                .clickable {
                                                    if (selectedSavedPath == item.filePath) selectedSavedPath = null
                                                    onDeleteSavedSignature(item.filePath)
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                Icons.Rounded.DeleteOutline,
                                                contentDescription = "Delete saved signature",
                                                tint = Color.White,
                                                modifier = Modifier.size(13.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Text(
                    if (selectedSavedBmp != null) "Using saved signature · tap it again to draw a new one"
                    else "Draw signature below",
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.muted
                )
                if (selectedSavedBmp == null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(145.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color.White)
                            .border(1.5.dp, palette.border, RoundedCornerShape(14.dp))
                            .onSizeChanged { canvasSize = it }
                            .pointerInput(Unit) {
                                detectDragGestures(
                                    onDragStart = { offset -> currentStroke = listOf(offset) },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        currentStroke = currentStroke + change.position
                                    },
                                    onDragEnd = {
                                        if (currentStroke.size > 1) strokes.add(currentStroke)
                                        currentStroke = emptyList()
                                    }
                                )
                            }
                            .testTag("signature_draw_pad")
                    ) {
                        Canvas(modifier = Modifier.matchParentSize()) {
                            val allStrokes = strokes + listOf(currentStroke)
                            allStrokes.forEach { pts ->
                                if (pts.size > 1) {
                                    val path = Path().apply {
                                        moveTo(pts.first().x, pts.first().y)
                                        pts.drop(1).forEach { lineTo(it.x, it.y) }
                                    }
                                    drawPath(
                                        path = path,
                                        color = Color(0xFF0F172A),
                                        style = Stroke(width = 7f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                                    )
                                }
                            }
                        }
                    }
                }

                // Interactive Drag-to-Place Page Preview
                Text(
                    "Drag badge on page preview to position signature",
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.muted
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFFF8FAFC))
                        .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                        .onSizeChanged { previewBoxSize = it }
                        .pointerInput(widthFraction) {
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                val w = previewBoxSize.width.coerceAtLeast(1).toFloat()
                                val h = previewBoxSize.height.coerceAtLeast(1).toFloat()
                                posX = (posX + dragAmount.x / w).coerceIn(0.02f, (1f - widthFraction).coerceAtLeast(0.05f))
                                posY = (posY + dragAmount.y / h).coerceIn(0.04f, 0.84f)
                            }
                        }
                        .testTag("signature_placement_preview")
                ) {
                    // Subtle faux document lines
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        repeat(5) { idx ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(if (idx == 4) 0.55f else 0.92f)
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(Color(0xFFE2E8F0))
                            )
                        }
                    }
                    val badgeW = (previewBoxSize.width * widthFraction).roundToInt().coerceAtLeast(64)
                    val offsetX = (previewBoxSize.width * posX).roundToInt().coerceIn(0, (previewBoxSize.width - badgeW).coerceAtLeast(0))
                    val offsetY = (previewBoxSize.height * posY).roundToInt().coerceIn(0, (previewBoxSize.height - 34).coerceAtLeast(0))
                    Surface(
                        color = palette.accent.copy(alpha = 0.22f),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .offset { IntOffset(offsetX, offsetY) }
                            .border(1.5.dp, palette.accent, RoundedCornerShape(8.dp))
                    ) {
                        Text(
                            text = if (includeDateStamp) "SIGN + DATE" else "SIGNATURE",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.accent,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                        )
                    }
                }

                // Size slider
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Size: ${(widthFraction * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, color = palette.muted)
                    Slider(
                        value = widthFraction,
                        onValueChange = { widthFraction = it },
                        valueRange = 0.18f..0.60f,
                        modifier = Modifier.weight(1f).padding(start = 10.dp)
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Stamp today's date below", style = MaterialTheme.typography.bodySmall, color = palette.text)
                    Switch(checked = includeDateStamp, onCheckedChange = { includeDateStamp = it })
                }

                if (selectedSavedBmp == null && onSaveSignatureForReuse != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Save signature for 1-tap reuse", style = MaterialTheme.typography.bodySmall, color = palette.text)
                        Switch(checked = saveForReuse, onCheckedChange = { saveForReuse = it })
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = hasSignature,
                onClick = {
                    val bmp = selectedSavedBmp ?: run {
                        val w = canvasSize.width.coerceAtLeast(400)
                        val h = canvasSize.height.coerceAtLeast(200)
                        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { out ->
                            val c = AndroidCanvas(out)
                            val p = AndroidPaint().apply {
                                color = AndroidColor.rgb(15, 23, 42)
                                strokeWidth = 8f
                                style = AndroidPaint.Style.STROKE
                                strokeCap = AndroidPaint.Cap.ROUND
                                strokeJoin = AndroidPaint.Join.ROUND
                                isAntiAlias = true
                            }
                            strokes.forEach { pts ->
                                if (pts.size > 1) {
                                    val ap = AndroidPath().apply {
                                        moveTo(pts.first().x, pts.first().y)
                                        pts.drop(1).forEach { lineTo(it.x, it.y) }
                                    }
                                    c.drawPath(ap, p)
                                }
                            }
                            if (saveForReuse) onSaveSignatureForReuse?.invoke(out)
                        }
                    }
                    val placement = SignaturePlacement(
                        posX = posX,
                        posY = posY,
                        widthFraction = widthFraction,
                        includeDateStamp = includeDateStamp
                    )
                    if (onApplyWithPlacement != null) {
                        onApplyWithPlacement(bmp, placement)
                    } else {
                        onApply(bmp)
                    }
                },
                modifier = Modifier.testTag("stamp_signature_confirm_btn")
            ) { Text("Stamp Signature") }
        },
        dismissButton = {
            Row {
                if (selectedSavedBmp == null) {
                    TextButton(onClick = { strokes.clear() }) { Text("Clear") }
                }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanShareSheet(
    isHttpRunning: Boolean,
    httpUrl: String,
    isFtpRunning: Boolean,
    ftpUrl: String,
    sharedCount: Int,
    onToggleHttp: () -> Unit,
    onToggleFtp: () -> Unit,
    onDismiss: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = palette.surface) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Wifi, contentDescription = null, tint = palette.accent)
                Spacer(Modifier.width(8.dp))
                Text("PC LAN File Explorer", style = MaterialTheme.typography.titleLarge, color = palette.text)
            }
            Text(
                "Browse, preview, or batch-download $sharedCount shared file(s) from any PC browser or FTP client on your same Wi-Fi.",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.muted
            )

            // HTTP Web Server Card
            Surface(color = palette.surface2, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Web Browser Explorer (HTTP)", style = MaterialTheme.typography.titleMedium, color = palette.text)
                            Text(
                                if (isHttpRunning) httpUrl else "Offline — tap to start",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isHttpRunning) palette.success else palette.muted
                            )
                        }
                        if (isHttpRunning) {
                            IconButton(onClick = { copyToClipboard(context, httpUrl) }) {
                                Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy URL", tint = palette.accent)
                            }
                        }
                        Switch(checked = isHttpRunning, onCheckedChange = { onToggleHttp() })
                    }
                }
            }

            // FTP Server Card
            Surface(color = palette.surface2, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(14.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Windows / Mac FTP Server", style = MaterialTheme.typography.titleMedium, color = palette.text)
                        Text(
                            if (isFtpRunning) ftpUrl else "Anonymous read-only vault mount",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isFtpRunning) palette.success else palette.muted
                        )
                    }
                    if (isFtpRunning) {
                        IconButton(onClick = { copyToClipboard(context, ftpUrl) }) {
                            Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy FTP URL", tint = palette.accent)
                        }
                    }
                    Switch(checked = isFtpRunning, onCheckedChange = { onToggleFtp() })
                }
            }
        }
    }
}

private fun copyToClipboard(context: Context, value: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("FileLens URL", value))
}

@Composable
fun VoiceNoteConfirmDialog(
    rawText: String,
    extraction: TemporalExtractionResult,
    linkableDocs: List<FileEntity>,
    onDismiss: () -> Unit,
    onSave: (
        title: String,
        transcript: String,
        temporalClass: String,
        resolvedDatetime: String?,
        items: List<ChecklistItem>,
        enableReminder: Boolean,
        linkedDoc: FileEntity?,
        recurrenceRule: String
    ) -> Unit
) {
    val palette = LocalFileLensColors.current
    val initialDt = remember(rawText, extraction.resolvedDatetime) {
        ScheduleDateTimeHelper.parseInitialLocalDateTime(extraction.resolvedDatetime)
    }
    var title by remember(rawText) { mutableStateOf(extraction.actionItems.firstOrNull()?.take(48) ?: rawText.take(48)) }
    var transcript by remember(rawText) { mutableStateOf(rawText) }
    var selectedDate by remember(rawText) { mutableStateOf(initialDt.toLocalDate()) }
    var selectedTime by remember(rawText) { mutableStateOf(initialDt.toLocalTime()) }
    var recurrenceRule by remember(rawText) { mutableStateOf(RecurrenceHelper.NONE) }
    var temporalClass by remember(rawText) {
        mutableStateOf(
            if (extraction.resolvedDatetime != null) {
                ScheduleDateTimeHelper.classifyTemporalFromDate(initialDt.toLocalDate())
            } else extraction.temporalClass
        )
    }
    var enableReminder by remember(rawText) { mutableStateOf(extraction.isHighConfidenceReminder) }
    var checklist by remember(rawText) { mutableStateOf(extraction.checklistItems) }
    var newActionText by remember { mutableStateOf("") }
    var selectedDoc by remember { mutableStateOf<FileEntity?>(null) }
    var showDocPicker by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = { Text(if (rawText.isBlank()) "Schedule Second Brain Task" else "Confirm Second Brain Note", color = palette.text) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Task / Note Title") },
                    placeholder = { Text("e.g. Pay Insurance / Doctor Visit") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("confirm_note_title_input")
                )
                OutlinedTextField(
                    value = transcript,
                    onValueChange = { transcript = it },
                    label = { Text("Details / Transcript") },
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth()
                )

                // Manual Calendar Date + Clock Time Picker + Quick Presets + Repeat Recurrence
                ScheduleDateTimeSection(
                    selectedDate = selectedDate,
                    selectedTime = selectedTime,
                    onDateTimeChanged = { newDate, newTime ->
                        selectedDate = newDate
                        selectedTime = newTime
                        temporalClass = ScheduleDateTimeHelper.classifyTemporalFromDate(newDate)
                        if (temporalClass != "historical") {
                            enableReminder = true
                        }
                    },
                    recurrenceRule = recurrenceRule,
                    onRecurrenceChanged = { nextRule ->
                        recurrenceRule = nextRule
                        if (RecurrenceHelper.isRecurring(nextRule)) enableReminder = true
                    }
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.NotificationsActive, contentDescription = null, tint = palette.accent, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Schedule Reminder Alert", style = MaterialTheme.typography.bodyMedium, color = palette.text)
                    }
                    Switch(checked = enableReminder, onCheckedChange = { enableReminder = it })
                }

                // Action Items
                Text("Action Checklist (${checklist.size})", style = MaterialTheme.typography.labelLarge, color = palette.muted)
                checklist.forEachIndexed { idx, item ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Text("• ${item.text}", style = MaterialTheme.typography.bodyMedium, color = palette.text, modifier = Modifier.weight(1f))
                        IconButton(
                            onClick = { checklist = checklist.filterIndexed { i, _ -> i != idx } },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove Item", tint = palette.danger, modifier = Modifier.size(18.dp))
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newActionText,
                        onValueChange = { newActionText = it },
                        placeholder = { Text("Add checklist step…") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = {
                        if (newActionText.isNotBlank()) {
                            checklist = checklist + ChecklistItem(id = "${System.currentTimeMillis()}", text = newActionText.trim())
                            newActionText = ""
                        }
                    }) {
                        Icon(Icons.Rounded.Add, contentDescription = "Add Action Step", tint = palette.accent)
                    }
                }

                // Link Document
                Box {
                    OutlinedButton(onClick = { showDocPicker = true }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Rounded.Link, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(selectedDoc?.name ?: "Link Indexed Document (Optional)")
                    }
                    DropdownMenu(expanded = showDocPicker, onDismissRequest = { showDocPicker = false }) {
                        DropdownMenuItem(text = { Text("None") }, onClick = { selectedDoc = null; showDocPicker = false })
                        linkableDocs.take(12).forEach { doc ->
                            DropdownMenuItem(
                                text = { Text(doc.name, maxLines = 1) },
                                onClick = { selectedDoc = doc; showDocPicker = false }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = title.isNotBlank() || transcript.isNotBlank(),
                onClick = {
                    val resolvedIso = ScheduleDateTimeHelper.toIsoOffsetString(selectedDate, selectedTime)
                    val safeTranscript = transcript.ifBlank { title }
                    onSave(title, safeTranscript, temporalClass, resolvedIso, checklist, enableReminder, selectedDoc, recurrenceRule)
                },
                modifier = Modifier.testTag("confirm_brain_note_btn")
            ) { Text("Schedule & Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Discard") }
        }
    )
}

@Composable
fun RescheduleNoteDialog(
    note: VoiceNoteEntity,
    onDismiss: () -> Unit,
    onSave: (
        title: String,
        temporalClass: String,
        resolvedDatetime: String?,
        items: List<ChecklistItem>,
        enableReminder: Boolean,
        recurrenceRule: String
    ) -> Unit
) {
    val palette = LocalFileLensColors.current
    val initialDt = remember(note.id, note.resolvedDatetime) {
        ScheduleDateTimeHelper.parseInitialLocalDateTime(note.resolvedDatetime)
    }
    var title by remember(note.id) { mutableStateOf(note.title) }
    var selectedDate by remember(note.id) { mutableStateOf(initialDt.toLocalDate()) }
    var selectedTime by remember(note.id) { mutableStateOf(initialDt.toLocalTime()) }
    var temporalClass by remember(note.id) { mutableStateOf(note.temporalClass) }
    var enableReminder by remember(note.id) { mutableStateOf(note.isReminderSet) }
    var recurrenceRule by remember(note.id) { mutableStateOf(RecurrenceHelper.normalize(note.recurrenceRule)) }
    val items = remember(note.id) { TemporalExtractor.parseChecklist(note.actionItemsJson) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = { Text("Reschedule Task", color = palette.text, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Task Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("reschedule_title_input")
                )

                ScheduleDateTimeSection(
                    selectedDate = selectedDate,
                    selectedTime = selectedTime,
                    onDateTimeChanged = { newDate, newTime ->
                        selectedDate = newDate
                        selectedTime = newTime
                        temporalClass = ScheduleDateTimeHelper.classifyTemporalFromDate(newDate)
                        if (temporalClass != "historical") {
                            enableReminder = true
                        }
                    },
                    recurrenceRule = recurrenceRule,
                    onRecurrenceChanged = { nextRule ->
                        recurrenceRule = nextRule
                        if (RecurrenceHelper.isRecurring(nextRule)) enableReminder = true
                    }
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.NotificationsActive, contentDescription = null, tint = palette.accent, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Reminder Alert", style = MaterialTheme.typography.bodyMedium, color = palette.text)
                    }
                    Switch(
                        checked = enableReminder,
                        onCheckedChange = { enableReminder = it },
                        modifier = Modifier.testTag("reschedule_reminder_switch")
                    )
                }

                // Quick option to archive/move to History
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = temporalClass == "historical",
                        onClick = {
                            temporalClass = "historical"
                            enableReminder = false
                            recurrenceRule = RecurrenceHelper.NONE
                        },
                        label = { Text("Move to History") }
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val resolvedIso = ScheduleDateTimeHelper.toIsoOffsetString(selectedDate, selectedTime)
                    onSave(title, temporalClass, resolvedIso, items, enableReminder, recurrenceRule)
                },
                modifier = Modifier.testTag("reschedule_save_btn")
            ) { Text("Update Schedule") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
