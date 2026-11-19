package com.filelenspro.app.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.NavigateBefore
import androidx.compose.material.icons.automirrored.rounded.NavigateNext
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Draw
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.PrivacyTip
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.WaterDrop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.domain.engine.SearchEngine
import com.filelenspro.app.domain.engine.TemporalExtractor
import com.filelenspro.app.service.OcrAndPdfEngine
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.util.FormatUtils
import java.io.File
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DocumentPreviewDialog(
    file: FileEntity,
    searchQuery: String,
    isBookmarked: Boolean,
    engine: OcrAndPdfEngine,
    onDismiss: () -> Unit,
    onToggleBookmark: () -> Unit,
    onRerunOcr: () -> Unit,
    onPromoteToCard: () -> Unit,
    onOpenWatermark: () -> Unit,
    onOpenSignature: (pageIndex: Int) -> Unit,
    onOpenPageOrganizer: () -> Unit,
    onApplyFilterOrRotate: ((filter: String, rotationDeg: Int) -> Unit)? = null,
    onShareMasked: (() -> Unit)? = null
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val ext = file.extension.lowercase(Locale.ROOT)
    val isPdf = ext == "pdf"
    val isImage = ext in setOf("jpg", "jpeg", "png", "webp", "bmp", "gif")

    var activeTab by remember { mutableIntStateOf(if (searchQuery.isNotBlank() && (!isImage && !isPdf)) 1 else 0) }
    var renderedPages by remember { mutableStateOf<List<String>>(emptyList()) }
    var currentPageIdx by remember { mutableIntStateOf(0) }
    var showExportSheet by remember { mutableStateOf(false) }
    var localToast by remember { mutableStateOf<SmartToastEvent?>(null) }

    // Pinch-to-zoom state
    var zoomScale by remember(currentPageIdx, file.uri) { mutableFloatStateOf(1f) }
    var panOffset by remember(currentPageIdx, file.uri) { mutableStateOf(Offset.Zero) }

    val extractedText = remember(file.contentText, file.ocrText) {
        listOfNotNull(file.ocrText, file.contentText)
            .filter { it.isNotBlank() }
            .distinct()
            .joinToString("\n\n")
            .ifBlank { "No text extracted yet. Tap Re-OCR to scan this file." }
    }
    val occurrences = remember(extractedText, searchQuery) {
        if (searchQuery.isBlank()) emptyList() else SearchEngine.findOccurrences(extractedText, searchQuery)
    }
    var matchNavIdx by remember(occurrences) { mutableIntStateOf(0) }
    val smartData = remember(extractedText) { TemporalExtractor.extractSmartData(extractedText) }

    LaunchedEffect(file.uri, file.modified, file.size, isPdf) {
        if (isPdf) {
            renderedPages = engine.renderPdfToImages(file.uri, limit = 50, maxDim = 1500)
            currentPageIdx = currentPageIdx.coerceIn(0, (renderedPages.size - 1).coerceAtLeast(0))
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            color = palette.bg,
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header
                Surface(color = palette.surface) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp).testTag("preview_close_btn")) {
                            Icon(Icons.Rounded.Close, contentDescription = "Close Preview", tint = palette.text)
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(file.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "${FormatUtils.formatSize(file.size)} · ${ext.uppercase()} · ${file.pageCount} pg${if (zoomScale > 1.05f) " · ${"%.1f".format(zoomScale)}x" else ""}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.muted
                            )
                        }
                        IconButton(onClick = onToggleBookmark, modifier = Modifier.size(48.dp).testTag("preview_bookmark_btn")) {
                            Icon(
                                if (isBookmarked) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                                contentDescription = "Toggle Bookmark",
                                tint = if (isBookmarked) palette.warning else palette.muted
                            )
                        }
                        IconButton(
                            onClick = { FormatUtils.shareFileOrText(context, file.uri, extractedText, file.name) },
                            modifier = Modifier.size(48.dp).testTag("preview_share_btn")
                        ) {
                            Icon(Icons.Rounded.Share, contentDescription = "Share File", tint = palette.text)
                        }
                    }
                }

                // Match Navigator Banner
                if (occurrences.isNotEmpty()) {
                    Surface(color = palette.accent.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Match ${matchNavIdx + 1} of ${occurrences.size}",
                                style = MaterialTheme.typography.labelLarge,
                                color = palette.accent,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { matchNavIdx = (matchNavIdx - 1 + occurrences.size) % occurrences.size },
                                modifier = Modifier.size(40.dp)
                            ) {
                                Icon(Icons.AutoMirrored.Rounded.NavigateBefore, contentDescription = "Previous Match", tint = palette.accent)
                            }
                            IconButton(
                                onClick = { matchNavIdx = (matchNavIdx + 1) % occurrences.size },
                                modifier = Modifier.size(40.dp)
                            ) {
                                Icon(Icons.AutoMirrored.Rounded.NavigateNext, contentDescription = "Next Match", tint = palette.accent)
                            }
                        }
                    }
                }

                // Tabs
                TabRow(selectedTabIndex = activeTab, containerColor = palette.surface, contentColor = palette.accent) {
                    Tab(selected = activeTab == 0, onClick = { activeTab = 0 }, text = { Text("Document") })
                    Tab(selected = activeTab == 1, onClick = { activeTab = 1 }, text = { Text("Extracted Text") })
                    Tab(selected = activeTab == 2, onClick = { activeTab = 2 }, text = { Text("Smart Data") })
                }

                // Body
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    when (activeTab) {
                        0 -> {
                            when {
                                isImage -> {
                                    Column(modifier = Modifier.fillMaxSize()) {
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(0.dp))
                                                .pointerInput(file.uri) {
                                                    detectTransformGestures { _, pan, zoom, _ ->
                                                        val nextScale = (zoomScale * zoom).coerceIn(1f, 4f)
                                                        zoomScale = nextScale
                                                        panOffset = if (nextScale > 1f) panOffset + pan else Offset.Zero
                                                    }
                                                }
                                                .pointerInput(file.uri) {
                                                    detectTapGestures(onDoubleTap = {
                                                        zoomScale = if (zoomScale > 1.2f) 1f else 2.2f
                                                        panOffset = Offset.Zero
                                                    })
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            val imgKey = "${file.uri}_${file.modified}_${file.size}"
                                            val imgReq = remember(imgKey) {
                                                ImageRequest.Builder(context)
                                                    .data(file.uri)
                                                    .memoryCacheKey(imgKey)
                                                    .diskCacheKey(imgKey)
                                                    .build()
                                            }
                                            AsyncImage(
                                                model = imgReq,
                                                contentDescription = file.name,
                                                contentScale = ContentScale.Fit,
                                                modifier = Modifier
                                                    .fillMaxSize()
                                                    .padding(10.dp)
                                                    .graphicsLayer(
                                                        scaleX = zoomScale,
                                                        scaleY = zoomScale,
                                                        translationX = panOffset.x,
                                                        translationY = panOffset.y
                                                    )
                                            )
                                        }
                                        if (onApplyFilterOrRotate != null) {
                                            Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .horizontalScroll(rememberScrollState())
                                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    AssistChip(
                                                        onClick = { onApplyFilterOrRotate("original", 90) },
                                                        leadingIcon = { Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                                        label = { Text("Rotate 90°") }
                                                    )
                                                    listOf("magic" to "Magic Color", "grayscale" to "Grayscale", "bw" to "B&W Crisp").forEach { (id, label) ->
                                                        FilterChip(
                                                            selected = false,
                                                            onClick = { onApplyFilterOrRotate(id, 0) },
                                                            label = { Text(label) }
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                isPdf -> {
                                    if (renderedPages.isEmpty()) {
                                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                            Text("Rendering PDF pages…", color = palette.muted)
                                        }
                                    } else {
                                        Column(modifier = Modifier.fillMaxSize()) {
                                            Box(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .fillMaxWidth()
                                                    .clip(RoundedCornerShape(0.dp))
                                                    .pointerInput(currentPageIdx, file.uri) {
                                                        detectTransformGestures { _, pan, zoom, _ ->
                                                            val nextScale = (zoomScale * zoom).coerceIn(1f, 4f)
                                                            zoomScale = nextScale
                                                            panOffset = if (nextScale > 1f) panOffset + pan else Offset.Zero
                                                        }
                                                    }
                                                    .pointerInput(currentPageIdx, file.uri) {
                                                        detectTapGestures(onDoubleTap = {
                                                            zoomScale = if (zoomScale > 1.2f) 1f else 2.2f
                                                            panOffset = Offset.Zero
                                                        })
                                                    },
                                                contentAlignment = Alignment.Center
                                            ) {
                                                val pagePath = renderedPages[currentPageIdx.coerceIn(0, renderedPages.lastIndex)]
                                                val pageReq = remember(pagePath) {
                                                    ImageRequest.Builder(context)
                                                        .data(File(pagePath))
                                                        .memoryCacheKey(pagePath)
                                                        .diskCacheKey(pagePath)
                                                        .build()
                                                }
                                                AsyncImage(
                                                    model = pageReq,
                                                    contentDescription = "Page ${currentPageIdx + 1}",
                                                    contentScale = ContentScale.Fit,
                                                    modifier = Modifier
                                                        .fillMaxSize()
                                                        .padding(10.dp)
                                                        .graphicsLayer(
                                                            scaleX = zoomScale,
                                                            scaleY = zoomScale,
                                                            translationX = panOffset.x,
                                                            translationY = panOffset.y
                                                        )
                                                )
                                            }
                                            if (renderedPages.size > 1) {
                                                Surface(color = palette.surface) {
                                                    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                            Text(
                                                                "Page ${currentPageIdx + 1} of ${renderedPages.size}",
                                                                style = MaterialTheme.typography.labelLarge,
                                                                color = palette.text
                                                            )
                                                            Text("Pinch or double-tap to zoom", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                                        }
                                                        Slider(
                                                            value = currentPageIdx.toFloat(),
                                                            onValueChange = { currentPageIdx = it.toInt() },
                                                            valueRange = 0f..(renderedPages.lastIndex).toFloat(),
                                                            steps = (renderedPages.size - 2).coerceAtLeast(0)
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                else -> {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .verticalScroll(rememberScrollState())
                                            .padding(16.dp)
                                    ) {
                                        val annotated = remember(extractedText, occurrences, matchNavIdx) {
                                            buildHighlightedText(extractedText, occurrences, matchNavIdx, palette.highlight, palette.highlightCurrent)
                                        }
                                        Text(annotated, style = MaterialTheme.typography.bodyLarge, color = palette.text)
                                    }
                                }
                            }
                        }

                        1 -> {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("${extractedText.length} characters extracted", style = MaterialTheme.typography.labelLarge, color = palette.muted)
                                    FilledTonalButton(
                                        onClick = {
                                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            cm.setPrimaryClip(ClipData.newPlainText(file.name, extractedText))
                                            localToast = SmartToastClassifier.create("Copied extracted text")
                                        }
                                    ) {
                                        Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Copy Text")
                                    }
                                }
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                        .verticalScroll(rememberScrollState())
                                ) {
                                    val annotated = remember(extractedText, occurrences, matchNavIdx) {
                                        buildHighlightedText(extractedText, occurrences, matchNavIdx, palette.highlight, palette.highlightCurrent)
                                    }
                                    Text(annotated, style = MaterialTheme.typography.bodyLarge, color = palette.text)
                                }
                            }
                        }

                        2 -> {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .verticalScroll(rememberScrollState())
                                    .padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                SmartDataSection("Detected Dates", smartData.dates) { localToast = SmartToastClassifier.create(it) }
                                SmartDataSection("Amounts & Currency", smartData.amounts) { localToast = SmartToastClassifier.create(it) }
                                SmartDataSection("Phone Numbers", smartData.phones) { localToast = SmartToastClassifier.create(it) }
                                SmartDataSection("Email Addresses", smartData.emails) { localToast = SmartToastClassifier.create(it) }
                                SmartDataSection("Document / ID Numbers", smartData.ids) { localToast = SmartToastClassifier.create(it) }
                                if (smartData.dates.isEmpty() && smartData.amounts.isEmpty() && smartData.phones.isEmpty() && smartData.emails.isEmpty() && smartData.ids.isEmpty()) {
                                    Surface(color = palette.surface, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                                        Text(
                                            "No structured dates, IDs, or amounts detected in extracted text yet.",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = palette.muted,
                                            modifier = Modifier.padding(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Bottom Tool Bar (Watermark & E-Sign now enabled for BOTH PDFs and Images)
                Surface(color = palette.surface) {
                    FlowRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilledTonalButton(onClick = onRerunOcr, modifier = Modifier.testTag("preview_reocr_btn")) {
                            Icon(Icons.Rounded.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Re-OCR")
                        }
                        FilledTonalButton(onClick = { showExportSheet = true }, modifier = Modifier.testTag("preview_export_btn")) {
                            Icon(Icons.Rounded.FileDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Export")
                        }
                        if (!file.isCard) {
                            FilledTonalButton(onClick = onPromoteToCard, modifier = Modifier.testTag("preview_card_btn")) {
                                Icon(Icons.Rounded.CreditCard, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Add Card")
                            }
                        }
                        if (isPdf) {
                            Button(onClick = onOpenPageOrganizer, modifier = Modifier.testTag("preview_organizer_btn")) {
                                Icon(Icons.Rounded.Layers, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Organize")
                            }
                        }
                        if (isImage || isPdf) {
                            OutlinedButton(onClick = onOpenWatermark, modifier = Modifier.testTag("preview_watermark_btn")) {
                                Icon(Icons.Rounded.WaterDrop, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Watermark")
                            }
                            OutlinedButton(onClick = { onOpenSignature(currentPageIdx) }, modifier = Modifier.testTag("preview_sign_btn")) {
                                Icon(Icons.Rounded.Draw, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Sign")
                            }
                            if (onShareMasked != null) {
                                FilledTonalButton(onClick = onShareMasked, modifier = Modifier.testTag("preview_mask_share_btn")) {
                                    Icon(Icons.Rounded.PrivacyTip, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Mask & Share")
                                }
                            }
                        }
                        OutlinedButton(onClick = { FormatUtils.openInExternalViewer(context, file.uri, ext) }) {
                            Icon(Icons.AutoMirrored.Rounded.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Open")
                        }
                    }
                }
            }
            SmartToastHost(
                event = localToast,
                onDismiss = { localToast = null },
                modifier = Modifier.align(Alignment.TopCenter),
                applyStatusBarPadding = false
            )
            }
        }
    }

    if (showExportSheet) {
        ExportFormatSheet(
            onDismiss = { showExportSheet = false },
            onSelectFormat = { fmt ->
                showExportSheet = false
                FormatUtils.exportTextToFileAndShare(context, file.name, fmt, extractedText, file)
            }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SmartDataSection(label: String, items: List<String>, onNotify: (String) -> Unit) {
    if (items.isEmpty()) return
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(14.dp))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.titleMedium, color = palette.text)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items.forEach { value ->
                    AssistChip(
                        onClick = {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            cm.setPrimaryClip(ClipData.newPlainText(label, value))
                            onNotify("Copied: $value")
                        },
                        label = { Text(value, style = MaterialTheme.typography.labelLarge) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExportFormatSheet(
    onDismiss: () -> Unit,
    onSelectFormat: (String) -> Unit
) {
    val palette = LocalFileLensColors.current
    val formats = listOf(
        "txt" to "Plain Text (.txt) — Clean OCR extract",
        "md" to "Markdown (.md) — Formatted document note",
        "csv" to "Spreadsheet (.csv) — Metadata + text columns",
        "json" to "Structured (.json) — Machine-readable schema"
    )
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = palette.surface) {
        Column(modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
            Text("Export Extracted Text", style = MaterialTheme.typography.titleLarge, color = palette.text)
            Spacer(Modifier.height(10.dp))
            formats.forEach { (ext, desc) ->
                Surface(
                    color = palette.surface2,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onSelectFormat(ext) }
                ) {
                    Text(desc, style = MaterialTheme.typography.bodyLarge, color = palette.text, modifier = Modifier.padding(14.dp))
                }
            }
        }
    }
}
