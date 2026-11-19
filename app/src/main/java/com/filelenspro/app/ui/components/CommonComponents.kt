package com.filelenspro.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.filelenspro.app.R
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.DeviceIndexSummary
import com.filelenspro.app.data.model.IndexProgress
import com.filelenspro.app.data.model.MatchOccurrence
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.service.OcrAndPdfEngine
import com.filelenspro.app.ui.navigation.BookmarksRoute
import com.filelenspro.app.ui.navigation.CardsRoute
import com.filelenspro.app.ui.navigation.DocScannerRoute
import com.filelenspro.app.ui.navigation.DocumentsRoute
import com.filelenspro.app.ui.navigation.FileAnalyserRoute
import com.filelenspro.app.ui.navigation.FileManagerRoute
import com.filelenspro.app.ui.navigation.LicenseRoute
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.navigation.SavedSearchesRoute
import com.filelenspro.app.ui.navigation.SearchRoute
import com.filelenspro.app.ui.navigation.SecondBrainRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import java.io.File
import java.util.Locale

@Composable
fun FileLensTopBar(
    title: String,
    subtitle: String? = null,
    onOpenQuickNav: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {}
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = palette.surface,
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = palette.surface2,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .size(44.dp)
                        .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                        .clip(RoundedCornerShape(14.dp))
                        .clickable(onClick = onOpenQuickNav)
                        .testTag("quick_nav_button")
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Rounded.Menu,
                            contentDescription = "Open Quick Navigation",
                            tint = palette.text,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.text,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (title == "FileSearchPro") {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(
                                        Brush.horizontalGradient(
                                            listOf(palette.accentGradientStart, palette.accentGradientEnd)
                                        )
                                    )
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "OFFLINE",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                    if (!subtitle.isNullOrBlank()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    content = actions
                )
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                palette.border.copy(alpha = 0.4f),
                                palette.accent.copy(alpha = 0.25f),
                                palette.border.copy(alpha = 0.4f)
                            )
                        )
                    )
            )
        }
    }
}

@Composable
fun RichIndexingProgressBanner(
    isIndexing: Boolean,
    progress: IndexProgress?,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalFileLensColors.current
    AnimatedVisibility(
        visible = isIndexing,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically(),
        modifier = modifier
    ) {
        val total = (progress?.total ?: 0).coerceAtLeast(0)
        val done = (progress?.indexed ?: 0).coerceAtLeast(0)
        val isIndeterminate = total == 0
        val pct = if (total > 0) ((done * 100) / total).coerceIn(0, 100) else 0

        Surface(
            color = palette.surface,
            shape = RoundedCornerShape(18.dp),
            shadowElevation = 3.dp,
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    width = 1.5.dp,
                    brush = Brush.horizontalGradient(listOf(palette.accentGradientStart, palette.accentGradientEnd)),
                    shape = RoundedCornerShape(18.dp)
                )
                .testTag("rich_indexing_progress_banner")
        ) {
            Column(
                modifier = Modifier
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                palette.accent.copy(alpha = 0.08f),
                                palette.purpleAccent.copy(alpha = 0.06f)
                            )
                        )
                    )
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                Brush.linearGradient(
                                    listOf(palette.accentGradientStart, palette.accentGradientEnd)
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            if (progress?.isFullDevice == true) Icons.Rounded.PhoneAndroid else Icons.Rounded.AutoAwesome,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = progress?.phase ?: "Indexing Files",
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.text,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (!isIndeterminate) {
                                Surface(
                                    color = palette.accent.copy(alpha = 0.14f),
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = "$pct%",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.accent,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }
                        Text(
                            text = progress?.currentFile?.ifBlank { "Scanning device storage…" } ?: "Preparing…",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    TextButton(
                        onClick = onCancel,
                        modifier = Modifier.testTag("cancel_indexing_btn")
                    ) {
                        Text("Cancel", color = palette.danger, fontWeight = FontWeight.SemiBold)
                    }
                }

                if (isIndeterminate) {
                    LinearProgressIndicator(
                        color = palette.accent,
                        trackColor = palette.surface2,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(6.dp))
                    )
                } else {
                    LinearProgressIndicator(
                        progress = { (done.toFloat() / total.toFloat()).coerceIn(0f, 1f) },
                        color = palette.accent,
                        trackColor = palette.surface2,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(6.dp))
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TelemetryMiniPill(
                        label = if (total > 0) "$done / $total processed" else "Discovering files…",
                        tint = palette.accent
                    )
                    if ((progress?.skippedUnchanged ?: 0) > 0) {
                        TelemetryMiniPill(
                            label = "${progress?.skippedUnchanged} unchanged skipped",
                            tint = palette.success
                        )
                    }
                    if ((progress?.removedDeleted ?: 0) > 0) {
                        TelemetryMiniPill(
                            label = "${progress?.removedDeleted} pruned",
                            tint = palette.warning
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun LastIndexSummaryStrip(
    summary: DeviceIndexSummary?,
    modifier: Modifier = Modifier
) {
    if (summary == null) return
    val palette = LocalFileLensColors.current
    val secStr = String.format(Locale.US, "%.1fs", summary.elapsedMs / 1000.0)
    Surface(
        color = palette.success.copy(alpha = 0.09f),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, palette.success.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                Icons.Rounded.Speed,
                contentDescription = null,
                tint = palette.success,
                modifier = Modifier.size(18.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = buildString {
                        append(if (summary.isFullDevice) "Full Device Sync" else "Vault Sync")
                        if (summary.wasCancelled) append(" (Paused)")
                        append(" · ")
                        append(secStr)
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.text,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "+${summary.newOrUpdated} new/updated · ${summary.skippedUnchanged} unchanged skipped" +
                        if (summary.removedDeleted > 0) " · ${summary.removedDeleted} deleted pruned" else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun TelemetryMiniPill(label: String, tint: Color) {
    Surface(
        color = tint.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = tint,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

@Composable
fun AllFilesPermissionDialog(
    onGrantPermission: () -> Unit,
    onUseFolderPicker: () -> Unit,
    onDismiss: () -> Unit
) {
    val palette = LocalFileLensColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(palette.accentGradientStart, palette.accentGradientEnd)
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Rounded.Storage, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                }
                Column {
                    Text("Index Entire Device", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("All Files Access Permission", style = MaterialTheme.typography.labelSmall, color = palette.accent)
                }
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Grant All Files Access so FileSearchPro can index PDFs, Office docs, receipts, bills, and photos across Downloads, Documents, WhatsApp, and Internal Storage all at once.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.textSecondary
                )
                listOf(
                    "Incremental Delta Sync: Unchanged files are skipped automatically — only new or modified files are scanned.",
                    "100% On-Device Offline: Zero cloud uploads, zero tracking, zero internet required.",
                    "Full Device File Manager: Browse Internal Storage, Downloads, Documents & DCIM directly."
                ).forEach { point ->
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(
                            Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            tint = palette.success,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(point, style = MaterialTheme.typography.bodyMedium, color = palette.text)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onGrantPermission,
                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                modifier = Modifier.testTag("grant_all_files_permission_btn")
            ) {
                Text("Allow All Files Access")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onUseFolderPicker) { Text("Pick Folder Instead") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        }
    )
}

@Composable
fun FileThumbnail(
    file: FileEntity,
    engine: OcrAndPdfEngine,
    modifier: Modifier = Modifier
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val ext = file.extension.lowercase(Locale.ROOT)
    val isImage = ext in setOf("jpg", "jpeg", "png", "webp", "bmp", "gif")
    val isPdf = ext == "pdf"
    val cacheKey = "${file.uri}_${file.modified}_${file.size}"
    var pdfThumbPath by remember(cacheKey) { mutableStateOf<String?>(null) }

    LaunchedEffect(cacheKey, isPdf) {
        if (isPdf) {
            pdfThumbPath = engine.getPdfThumbnailPath(file.uri)
        }
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(palette.surface2)
            .border(1.dp, palette.border, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        when {
            isImage -> {
                val imgReq = remember(cacheKey) {
                    ImageRequest.Builder(context)
                        .data(file.uri)
                        .memoryCacheKey(cacheKey)
                        .diskCacheKey(cacheKey)
                        .crossfade(true)
                        .build()
                }
                AsyncImage(
                    model = imgReq,
                    contentDescription = file.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
            isPdf && pdfThumbPath != null -> {
                val thumbPath = pdfThumbPath!!
                val pdfReq = remember(thumbPath) {
                    ImageRequest.Builder(context)
                        .data(File(thumbPath))
                        .memoryCacheKey(thumbPath)
                        .diskCacheKey(thumbPath)
                        .crossfade(true)
                        .build()
                }
                AsyncImage(
                    model = pdfReq,
                    contentDescription = "${file.name} preview",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
            else -> {
                val badgeColor = when (ext) {
                    "pdf" -> palette.danger
                    "doc", "docx", "txt", "md", "rtf" -> palette.accent
                    "xls", "xlsx", "csv" -> palette.success
                    "ppt", "pptx" -> palette.warning
                    else -> palette.purpleAccent
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(badgeColor.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = ext.uppercase(Locale.ROOT).take(4).ifBlank { "FILE" },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = badgeColor
                    )
                }
            }
        }
    }
}

fun buildHighlightedText(
    text: String,
    occurrences: List<MatchOccurrence>,
    currentIndex: Int,
    highlightColor: Color,
    currentHighlightColor: Color
): AnnotatedString {
    if (occurrences.isEmpty() || text.isEmpty()) return AnnotatedString(text)
    return buildAnnotatedString {
        append(text)
        occurrences.forEachIndexed { idx, occ ->
            val safeStart = occ.start.coerceIn(0, text.length)
            val safeEnd = occ.end.coerceIn(safeStart, text.length)
            if (safeEnd > safeStart) {
                addStyle(
                    style = SpanStyle(
                        background = if (idx == currentIndex) currentHighlightColor else highlightColor,
                        fontWeight = if (idx == currentIndex) FontWeight.Bold else FontWeight.Medium
                    ),
                    start = safeStart,
                    end = safeEnd
                )
            }
        }
    }
}

private data class QuickNavAction(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val tint: Color,
    val route: Any
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickNavSheet(
    isProActivated: Boolean,
    onDismiss: () -> Unit,
    onNavigate: (Any) -> Unit,
    onOpenTutorial: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val items = remember(palette) {
        listOf(
            QuickNavAction("Search Hub", "Instant offline & AI search", Icons.Rounded.Search, palette.accent, SearchRoute),
            QuickNavAction("Doc Scanner", "Live auto-crop, filters & PDF", Icons.Rounded.DocumentScanner, palette.success, DocScannerRoute()),
            QuickNavAction("File Manager", "Device storage & LAN Share", Icons.Rounded.FolderOpen, palette.warning, FileManagerRoute),
            QuickNavAction("Space Cleaner", "Shrink photos, junk & clones", Icons.Rounded.Analytics, palette.danger, FileAnalyserRoute),
            QuickNavAction("Scans & Docs", "PDF library & quick OCR", Icons.Rounded.Description, palette.accentSoft, DocumentsRoute),
            QuickNavAction("Page Organizer", "Merge, split, rotate PDFs", Icons.Rounded.Layers, palette.purpleAccent, PageOrganizerRoute()),
            QuickNavAction("Smart Cards", "IDs, bills & expiry alerts", Icons.Rounded.CreditCard, palette.success, CardsRoute),
            QuickNavAction("Second Brain", "Voice timeline & checklists", Icons.Rounded.Psychology, palette.warning, SecondBrainRoute),
            QuickNavAction("Bookmarks", "Starred docs & tag hub", Icons.Rounded.Bookmark, palette.cyanAccent, BookmarksRoute),
            QuickNavAction("Saved Searches", "One-tap query presets", Icons.Rounded.Star, palette.warning, SavedSearchesRoute),
            QuickNavAction(if (isProActivated) "Pro Active" else "Go Pro", "License & desktop sync", Icons.Rounded.Verified, palette.success, LicenseRoute)
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Quick Navigation", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("Jump directly to any FileSearchPro tool", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
                OutlinedButton(
                    onClick = {
                        onDismiss()
                        onOpenTutorial()
                    },
                    modifier = Modifier.testTag("quick_nav_tutorial_btn")
                ) {
                    Icon(Icons.AutoMirrored.Rounded.HelpOutline, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Guide")
                }
            }
            Spacer(Modifier.height(14.dp))
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 152.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.height(390.dp)
            ) {
                items(items) { item ->
                    Surface(
                        color = palette.card,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            .clip(RoundedCornerShape(16.dp))
                            .clickable {
                                onDismiss()
                                onNavigate(item.route)
                            }
                            .testTag("quick_nav_${item.title.lowercase().replace(" ", "_")}")
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(item.tint.copy(alpha = 0.14f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(item.icon, contentDescription = item.title, tint = item.tint, modifier = Modifier.size(21.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.title, style = MaterialTheme.typography.labelLarge, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(item.subtitle, style = MaterialTheme.typography.bodyMedium, color = palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagManagementDialog(
    currentTag: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    val palette = LocalFileLensColors.current
    var input by remember { mutableStateOf(currentTag) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = { Text("Organize Smart Card Tag", color = palette.text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text("Card Tag") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("tag_input_field")
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SmartTaxonomy.QUICK_CARD_TAGS.forEach { tag ->
                        FilterChip(
                            selected = input.equals(tag, ignoreCase = true),
                            onClick = { input = tag },
                            label = { Text(tag) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(input.trim().ifBlank { "Document" }) },
                modifier = Modifier.testTag("save_tag_confirm")
            ) { Text("Save Tag") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun TutorialDialog(onDismiss: () -> Unit) {
    val palette = LocalFileLensColors.current
    val steps = listOf(
        "1. Entire Device Incremental Index" to "Tap \"Index Entire Device\" to index PDFs, Office docs, bills, and photos across your phone all at once. Subsequent syncs skip unchanged files automatically.",
        "2. Instant Live Document Scanner" to "Burst-scan multi-page PDFs with live edge detection, hands-free auto-capture, 4-corner perspective crop, shadow-free B&W, smart auto-naming, and AES-128 PDF password lock.",
        "3. Voice Second Brain" to "Dictate reminders in 16 languages. Temporal extraction automatically classifies Today, Upcoming, and History with checklists.",
        "4. Smart Photo Shrink & Cleaner" to "Shrink photos up to 60% without losing visual clarity (JPEG or WebP), auto-categorize IDs & bills, and purge duplicate/blurry shots."
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = { Text("FileSearchPro Quick Guide", color = palette.text) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                steps.forEach { (heading, body) ->
                    Surface(color = palette.surface2, shape = RoundedCornerShape(12.dp)) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(heading, style = MaterialTheme.typography.titleMedium, color = palette.accent)
                            Spacer(Modifier.height(4.dp))
                            Text(body, style = MaterialTheme.typography.bodyMedium, color = palette.textSecondary)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss, modifier = Modifier.testTag("tutorial_done_button")) {
                Text("Got It")
            }
        }
    )
}

@Composable
fun PrivacyPolicyDialog(onDismiss: () -> Unit) {
    val palette = LocalFileLensColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Shield, contentDescription = null, tint = palette.success)
                Spacer(Modifier.width(8.dp))
                Text("100% On-Device Privacy", color = palette.text)
            }
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.img_privacy_shield),
                    contentDescription = "Zero-Cloud On-Device Privacy Shield",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .clip(RoundedCornerShape(14.dp))
                )
                listOf(
                    "Zero Cloud Uploads: All OCR, semantic embeddings, duplicate hashing, and voice parsing execute locally on your device.",
                    "Zero Tracking & No Ads: No analytics SDKs, no telemetry beacons, and no background data collection.",
                    "User-Controlled Storage Access: Choose either All Files Access for full-device offline search or Android Photo Picker / SAF for scoped folders.",
                    "LAN Share Control: HTTP/FTP sharing runs strictly on your local Wi-Fi when you explicitly start it and stops immediately on close."
                ).forEach { line ->
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = palette.success, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(line, style = MaterialTheme.typography.bodyMedium, color = palette.textSecondary)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss, colors = ButtonDefaults.buttonColors(containerColor = palette.accent)) {
                Text("Close")
            }
        }
    )
}
