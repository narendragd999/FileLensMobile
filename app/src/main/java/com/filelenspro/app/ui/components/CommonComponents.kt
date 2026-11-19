package com.filelenspro.app.ui.components

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
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filelenspro.app.R
import com.filelenspro.app.data.db.FileEntity
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
        tonalElevation = 0.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onOpenQuickNav,
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("quick_nav_button")
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Menu,
                        contentDescription = "Open Quick Navigation",
                        tint = palette.text
                    )
                }
                Spacer(Modifier.width(4.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        color = palette.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
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
                    .background(palette.border)
            )
        }
    }
}

@Composable
fun FileThumbnail(
    file: FileEntity,
    engine: OcrAndPdfEngine,
    modifier: Modifier = Modifier
) {
    val palette = LocalFileLensColors.current
    val ext = file.extension.lowercase(Locale.ROOT)
    val isImage = ext in setOf("jpg", "jpeg", "png", "webp", "bmp", "gif")
    val isPdf = ext == "pdf"
    var pdfThumbPath by remember(file.uri) { mutableStateOf<String?>(null) }

    LaunchedEffect(file.uri, isPdf) {
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
                AsyncImage(
                    model = file.uri,
                    contentDescription = file.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
            isPdf && pdfThumbPath != null -> {
                AsyncImage(
                    model = File(pdfThumbPath!!),
                    contentDescription = "${file.name} preview",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
            else -> {
                val badgeColor = when (ext) {
                    "pdf" -> palette.danger
                    "doc", "docx", "txt", "md" -> palette.accent
                    "xls", "xlsx", "csv" -> palette.success
                    else -> palette.warning
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
            QuickNavAction("Doc Scanner", "Multi-page & 2-in-1 ID", Icons.Rounded.DocumentScanner, palette.success, DocScannerRoute()),
            QuickNavAction("File Manager", "App vault & LAN Explorer", Icons.Rounded.FolderOpen, palette.warning, FileManagerRoute),
            QuickNavAction("Space Cleaner", "Junk, duplicates & clones", Icons.Rounded.Analytics, palette.danger, FileAnalyserRoute),
            QuickNavAction("Scans & Docs", "PDF library & quick OCR", Icons.Rounded.Description, palette.accentSoft, DocumentsRoute),
            QuickNavAction("Page Organizer", "Merge, split, rotate PDFs", Icons.Rounded.Layers, palette.accent, PageOrganizerRoute()),
            QuickNavAction("Smart Cards", "IDs, bills & expiry alerts", Icons.Rounded.CreditCard, palette.success, CardsRoute),
            QuickNavAction("Second Brain", "Voice timeline & checklists", Icons.Rounded.Psychology, palette.warning, SecondBrainRoute),
            QuickNavAction("Bookmarks", "Starred docs & tag hub", Icons.Rounded.Bookmark, palette.accent, BookmarksRoute),
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
                modifier = Modifier.height(380.dp)
            ) {
                items(items) { item ->
                    Surface(
                        color = palette.surface2,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
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
                                    .size(38.dp)
                                    .clip(CircleShape)
                                    .background(item.tint.copy(alpha = 0.14f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(item.icon, contentDescription = item.title, tint = item.tint, modifier = Modifier.size(20.dp))
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
        "1. Instant Offline Search" to "Pick PDFs, photos, or folders — ML Kit OCR extracts text in English & Hindi on-device so you can search in milliseconds.",
        "2. Multi-Page PDF Scanner" to "Scan multi-page documents or composite front + back ID cards onto a single A4 PDF, then reorder or rotate in Page Organizer.",
        "3. Voice Second Brain" to "Dictate reminders in 16 languages. Temporal extraction automatically classifies Today, Upcoming, and History with checklists.",
        "4. Smart Cards & Cleaner" to "Auto-categorize Medical, Govt IDs, Finance & Vehicle docs, track expiry alerts, and purge duplicate/blurry photos."
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
                    "Scoped Access: Photos and documents are accessed exclusively via the Android Photo Picker and Storage Access Framework (SAF).",
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
