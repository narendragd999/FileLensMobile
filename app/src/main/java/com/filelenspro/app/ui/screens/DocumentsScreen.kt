package com.filelenspro.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.AddToPhotos
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.DriveFileRenameOutline
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.MergeType
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SelectAll
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.ui.components.DocumentPreviewDialog
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.FileThumbnail
import com.filelenspro.app.ui.components.RichIndexingProgressBanner
import com.filelenspro.app.ui.navigation.CreateCardRoute
import com.filelenspro.app.ui.navigation.DocScannerRoute
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.navigation.PdfViewerRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@Composable
fun DocumentsScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val docs by toolsViewModel.pdfAndScannedDocs.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val savedSignatures by toolsViewModel.savedSignatures.collectAsState()
    val isIndexing by searchViewModel.isIndexing.collectAsState()
    val indexProgress by searchViewModel.indexProgress.collectAsState()
    val bookmarkedUris = remember(bookmarks) { bookmarks.map { it.fileUri }.toSet() }
    val totalPages = remember(docs) { docs.sumOf { it.pageCount.coerceAtLeast(1) } }
    val ocrReadyCount = remember(docs) { docs.count { it.ocrStatus == "done" } }

    var searchQuery by remember { mutableStateOf("") }
    var sortMode by remember { mutableStateOf("newest") } // newest | name | size | pages
    var showSortMenu by remember { mutableStateOf(false) }
    var filterMode by remember { mutableStateOf("all") }
    var isGridView by remember { mutableStateOf(false) }
    var selectionMode by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var showMergeDialog by remember { mutableStateOf(false) }

    var previewDoc by remember { mutableStateOf<FileEntity?>(null) }
    var renameDoc by remember { mutableStateOf<FileEntity?>(null) }
    var watermarkDoc by remember { mutableStateOf<FileEntity?>(null) }
    var signatureDoc by remember { mutableStateOf<Pair<FileEntity, Int>?>(null) }

    val pdfImporter = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            searchViewModel.importUris(uris)
            toolsViewModel.postToast("Importing & indexing ${uris.size} document(s)…")
        }
    }

    val filtered = remember(docs, filterMode, searchQuery, sortMode) {
        val base = when (filterMode) {
            "scanned" -> docs.filter { it.isScanned }
            "pdfs" -> docs.filter { it.extension.equals("pdf", true) }
            "cards" -> docs.filter { it.isCard }
            else -> docs
        }
        val searched = if (searchQuery.isBlank()) base else {
            val q = searchQuery.trim().lowercase()
            base.filter {
                it.name.lowercase().contains(q) ||
                    it.customTag.lowercase().contains(q) ||
                    (it.ocrText?.lowercase()?.contains(q) == true)
            }
        }
        when (sortMode) {
            "name" -> searched.sortedBy { it.name.lowercase() }
            "size" -> searched.sortedByDescending { it.size }
            "pages" -> searched.sortedByDescending { it.pageCount }
            else -> searched.sortedByDescending { it.modified }
        }
    }

    val selectedDocs = remember(filtered, selectedIds) { filtered.filter { it.id in selectedIds } }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
        ) {
            FileLensTopBar(
                title = "Scans & Docs",
                subtitle = "${filtered.size} document(s) · PDF Tools & OCR",
                onOpenQuickNav = onOpenQuickNav,
                actions = {
                    IconButton(
                        onClick = {
                            selectionMode = !selectionMode
                            if (!selectionMode) selectedIds = emptySet()
                        },
                        modifier = Modifier.size(44.dp).testTag("docs_multiselect_btn")
                    ) {
                        Icon(
                            Icons.Rounded.SelectAll,
                            contentDescription = "Batch Select",
                            tint = if (selectionMode) palette.accent else palette.text
                        )
                    }
                    Box {
                        IconButton(onClick = { showSortMenu = true }, modifier = Modifier.size(44.dp).testTag("docs_sort_btn")) {
                            Icon(Icons.AutoMirrored.Rounded.Sort, contentDescription = "Sort Documents", tint = palette.text)
                        }
                        DropdownMenu(expanded = showSortMenu, onDismissRequest = { showSortMenu = false }) {
                            listOf("newest" to "Newest First", "name" to "Name (A-Z)", "size" to "Largest Size", "pages" to "Most Pages").forEach { (id, label) ->
                                DropdownMenuItem(
                                    text = { Text(if (sortMode == id) "✓ $label" else label) },
                                    onClick = { sortMode = id; showSortMenu = false }
                                )
                            }
                        }
                    }
                    IconButton(
                        onClick = { isGridView = !isGridView },
                        modifier = Modifier.size(44.dp).testTag("docs_view_toggle_btn")
                    ) {
                        Icon(
                            if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                            contentDescription = "Toggle List or Grid",
                            tint = palette.text
                        )
                    }
                    IconButton(
                        onClick = { onNavigate(PageOrganizerRoute()) },
                        modifier = Modifier.size(44.dp).testTag("docs_organizer_shortcut_btn")
                    ) {
                        Icon(Icons.Rounded.Layers, contentDescription = "Open Page Organizer", tint = palette.accent)
                    }
                }
            )

            // Search & Action Header
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.surface)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Filter documents by name, tag, or OCR…") },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                    trailingIcon = {
                        if (searchQuery.isNotBlank()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Rounded.Close, contentDescription = "Clear")
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().testTag("docs_search_input")
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = { onNavigate(DocScannerRoute("batch")) },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).testTag("docs_scan_pdf_btn")
                    ) {
                        Icon(Icons.Rounded.DocumentScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Scan Multi-Page", fontWeight = FontWeight.SemiBold)
                    }
                    OutlinedButton(
                        onClick = { pdfImporter.launch(arrayOf("application/pdf", "image/*")) },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).testTag("docs_import_pdf_btn")
                    ) {
                        Icon(Icons.Rounded.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Import PDF")
                    }
                }
            }

            RichIndexingProgressBanner(
                isIndexing = isIndexing,
                progress = indexProgress,
                onCancel = { searchViewModel.cancelIndexing() },
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
            )

            // Gradient PDF Studio Telemetry Strip
            Surface(
                shape = RoundedCornerShape(16.dp),
                shadowElevation = 2.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Brush.horizontalGradient(listOf(palette.accentGradientStart, palette.accentGradientEnd)))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("PDF & Scan Studio", style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold)
                        Text("${docs.size} docs · $totalPages pages · $ocrReadyCount OCR searchable", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.85f))
                    }
                    Surface(
                        color = Color.White.copy(alpha = 0.18f),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { onNavigate(PageOrganizerRoute()) }
                    ) {
                        Text(
                            "Organize",
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            // Batch Selection Action Bar
            if (selectionMode) {
                Surface(color = palette.accent.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "${selectedIds.size} selected",
                            style = MaterialTheme.typography.labelLarge,
                            color = palette.accent,
                            modifier = Modifier.weight(1f)
                        )
                        val pdfCount = selectedDocs.count { it.extension.equals("pdf", true) }
                        if (pdfCount >= 2) {
                            Button(
                                onClick = { showMergeDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                modifier = Modifier.testTag("docs_merge_selected_btn")
                            ) {
                                Icon(Icons.Rounded.MergeType, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Merge ($pdfCount)")
                            }
                        }
                        if (selectedDocs.isNotEmpty()) {
                            IconButton(
                                onClick = {
                                    selectedDocs.forEach { toolsViewModel.deleteIndexedFile(it, true) }
                                    selectedIds = emptySet()
                                    selectionMode = false
                                }
                            ) {
                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete Selected", tint = palette.danger)
                            }
                        }
                        IconButton(onClick = { selectionMode = false; selectedIds = emptySet() }) {
                            Icon(Icons.Rounded.Close, contentDescription = "Exit Selection", tint = palette.text)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf("all" to "All (${docs.size})", "scanned" to "Scanned", "pdfs" to "PDFs", "cards" to "Cards").forEach { (id, label) ->
                    FilterChip(
                        selected = filterMode == id,
                        onClick = { filterMode = id },
                        label = { Text(label) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = palette.accent,
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }

            if (filtered.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.dim, modifier = Modifier.size(54.dp))
                        Spacer(Modifier.height(10.dp))
                        Text("No Scans or PDFs Yet", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Tap Scan Multi-Page to capture fast multi-page PDFs with ML Kit or import existing PDFs.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted
                        )
                    }
                }
            } else if (isGridView) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 156.dp),
                    contentPadding = PaddingValues(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filtered, key = { it.id }) { doc ->
                        val isSel = doc.id in selectedIds
                        Surface(
                            color = if (isSel) palette.accent.copy(alpha = 0.1f) else palette.surface,
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(if (isSel) 2.dp else 1.dp, if (isSel) palette.accent else palette.border, RoundedCornerShape(16.dp))
                                .clip(RoundedCornerShape(16.dp))
                                .clickable {
                                    if (selectionMode) {
                                        selectedIds = if (isSel) selectedIds - doc.id else selectedIds + doc.id
                                    } else if (doc.extension.equals("pdf", true)) {
                                        onNavigate(PdfViewerRoute(doc.id, doc.uri, doc.name))
                                    } else {
                                        previewDoc = doc
                                    }
                                }
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Box {
                                    FileThumbnail(file = doc, engine = toolsViewModel.engine, modifier = Modifier.fillMaxWidth().height(130.dp))
                                    if (doc.pageCount > 1) {
                                        Surface(
                                            color = Color.Black.copy(alpha = 0.72f),
                                            shape = RoundedCornerShape(8.dp),
                                            modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp)
                                        ) {
                                            Text(
                                                "${doc.pageCount} pg",
                                                color = Color.White,
                                                style = MaterialTheme.typography.labelSmall,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                    if (selectionMode) {
                                        Icon(
                                            if (isSel) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                            contentDescription = "Select",
                                            tint = if (isSel) palette.accent else Color.White,
                                            modifier = Modifier.align(Alignment.TopEnd).padding(6.dp)
                                        )
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Text(doc.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(FormatUtils.formatSize(doc.size), style = MaterialTheme.typography.labelSmall, color = palette.muted)
                            }
                        }
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filtered, key = { it.id }) { doc ->
                        val isSel = doc.id in selectedIds
                        DocumentListRow(
                            doc = doc,
                            engine = toolsViewModel.engine,
                            selectionMode = selectionMode,
                            isSelected = isSel,
                            onClick = {
                                if (selectionMode) {
                                    selectedIds = if (isSel) selectedIds - doc.id else selectedIds + doc.id
                                } else {
                                    previewDoc = doc
                                }
                            },
                            onOpenPdfViewer = { onNavigate(PdfViewerRoute(doc.id, doc.uri, doc.name)) },
                            onOrganize = { onNavigate(PageOrganizerRoute(doc.uri, doc.name)) },
                            onAppendScan = { onNavigate(DocScannerRoute(mode = "batch", appendToPdfUri = doc.uri)) },
                            onRerunOcr = { toolsViewModel.rerunOcrForFile(doc) },
                            onPromoteToCard = { onNavigate(CreateCardRoute(doc.uri, doc.id, doc.name, doc.customTag)) },
                            onRename = { renameDoc = doc },
                            onDelete = { toolsViewModel.deleteIndexedFile(doc, true) }
                        )
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { onNavigate(DocScannerRoute("batch")) },
            containerColor = palette.accent,
            contentColor = Color.White,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(18.dp)
                .testTag("docs_fab_scanner")
        ) {
            Icon(Icons.Rounded.DocumentScanner, contentDescription = "Scan Multi-Page PDF")
        }
    }

    if (showMergeDialog) {
        var mergeTitle by remember { mutableStateOf("Merged_${System.currentTimeMillis() % 10000}") }
        AlertDialog(
            onDismissRequest = { showMergeDialog = false },
            containerColor = palette.surface,
            title = { Text("Merge Selected PDFs", color = palette.text) },
            text = {
                OutlinedTextField(
                    value = mergeTitle,
                    onValueChange = { mergeTitle = it },
                    label = { Text("Output PDF Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    toolsViewModel.mergeSelectedPdfs(selectedDocs, mergeTitle)
                    showMergeDialog = false
                    selectionMode = false
                    selectedIds = emptySet()
                }) { Text("Merge PDFs") }
            },
            dismissButton = { TextButton(onClick = { showMergeDialog = false }) { Text("Cancel") } }
        )
    }

    previewDoc?.let { file ->
        val fresh = docs.firstOrNull { it.id == file.id } ?: file
        DocumentPreviewDialog(
            file = fresh,
            searchQuery = "",
            isBookmarked = fresh.uri in bookmarkedUris,
            engine = toolsViewModel.engine,
            onDismiss = { previewDoc = null },
            onToggleBookmark = { searchViewModel.toggleBookmark(fresh) },
            onRerunOcr = { toolsViewModel.rerunOcrForFile(fresh) },
            onPromoteToCard = { toolsViewModel.promoteFileToCard(fresh, fresh.customTag.ifBlank { "Document" }) },
            onOpenWatermark = { watermarkDoc = fresh },
            onOpenSignature = { pageIdx -> signatureDoc = fresh to pageIdx },
            onOpenPageOrganizer = {
                previewDoc = null
                onNavigate(PageOrganizerRoute(fresh.uri, fresh.name))
            },
            onApplyFilterOrRotate = { filter, rot ->
                toolsViewModel.applyImageFilterOrRotate(fresh, filter, rot)
            },
            onShareMasked = {
                toolsViewModel.shareMaskedDocument(context, fresh)
            }
        )
    }

    renameDoc?.let { doc ->
        var nameInput by remember { mutableStateOf(doc.name.substringBeforeLast('.')) }
        AlertDialog(
            onDismissRequest = { renameDoc = null },
            containerColor = palette.surface,
            title = { Text("Rename Document", color = palette.text) },
            text = {
                OutlinedTextField(
                    value = nameInput,
                    onValueChange = { nameInput = it },
                    label = { Text("Document Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    toolsViewModel.renameDocument(doc, nameInput)
                    renameDoc = null
                }) { Text("Rename") }
            },
            dismissButton = { TextButton(onClick = { renameDoc = null }) { Text("Cancel") } }
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
private fun DocumentListRow(
    doc: FileEntity,
    engine: com.filelenspro.app.service.OcrAndPdfEngine,
    selectionMode: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
    onOpenPdfViewer: () -> Unit,
    onOrganize: () -> Unit,
    onAppendScan: () -> Unit,
    onRerunOcr: () -> Unit,
    onPromoteToCard: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalFileLensColors.current
    var showMenu by remember { mutableStateOf(false) }

    Surface(
        color = if (isSelected) palette.accent.copy(alpha = 0.1f) else palette.surface,
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .border(if (isSelected) 2.dp else 1.dp, if (isSelected) palette.accent else palette.border, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (selectionMode) {
                Icon(
                    if (isSelected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                    contentDescription = "Select Document",
                    tint = if (isSelected) palette.accent else palette.muted,
                    modifier = Modifier.padding(end = 8.dp)
                )
            }
            FileThumbnail(file = doc, engine = engine, modifier = Modifier.size(56.dp))
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(doc.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(3.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${FormatUtils.formatSize(doc.size)} · ${doc.pageCount} pg",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.muted
                    )
                    Surface(
                        color = if (doc.ocrStatus == "done") palette.success.copy(alpha = 0.14f) else palette.warning.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            if (doc.ocrStatus == "done") "OCR Ready" else doc.ocrStatus.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (doc.ocrStatus == "done") palette.success else palette.warning,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            if (!selectionMode) {
                Box {
                    IconButton(onClick = { showMenu = true }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = "Document Actions", tint = palette.muted)
                    }
                    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                        if (doc.extension.equals("pdf", true)) {
                            DropdownMenuItem(
                                text = { Text("Open PDF Reader") },
                                leadingIcon = { Icon(Icons.Rounded.PictureAsPdf, contentDescription = null) },
                                onClick = { showMenu = false; onOpenPdfViewer() }
                            )
                            DropdownMenuItem(
                                text = { Text("Organize Pages") },
                                leadingIcon = { Icon(Icons.Rounded.Layers, contentDescription = null) },
                                onClick = { showMenu = false; onOrganize() }
                            )
                            DropdownMenuItem(
                                text = { Text("Scan & Append Pages") },
                                leadingIcon = { Icon(Icons.Rounded.AddToPhotos, contentDescription = null) },
                                onClick = { showMenu = false; onAppendScan() }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Re-Run OCR") },
                            leadingIcon = { Icon(Icons.Rounded.Refresh, contentDescription = null) },
                            onClick = { showMenu = false; onRerunOcr() }
                        )
                        DropdownMenuItem(
                            text = { Text("Add to Smart Cards") },
                            leadingIcon = { Icon(Icons.Rounded.CreditCard, contentDescription = null) },
                            onClick = { showMenu = false; onPromoteToCard() }
                        )
                        DropdownMenuItem(
                            text = { Text("Rename") },
                            leadingIcon = { Icon(Icons.Rounded.DriveFileRenameOutline, contentDescription = null) },
                            onClick = { showMenu = false; onRename() }
                        )
                        DropdownMenuItem(
                            text = { Text("Delete", color = palette.danger) },
                            leadingIcon = { Icon(Icons.Rounded.DeleteOutline, contentDescription = null, tint = palette.danger) },
                            onClick = { showMenu = false; onDelete() }
                        )
                    }
                }
            }
        }
    }
}
