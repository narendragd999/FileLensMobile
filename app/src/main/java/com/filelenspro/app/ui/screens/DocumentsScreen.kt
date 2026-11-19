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
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.DriveFileRenameOutline
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Refresh
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
import androidx.compose.ui.graphics.Color
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
    val docs by toolsViewModel.pdfAndScannedDocs.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val bookmarkedUris = remember(bookmarks) { bookmarks.map { it.fileUri }.toSet() }

    var filterMode by remember { mutableStateOf("all") }
    var isGridView by remember { mutableStateOf(false) }
    var previewDoc by remember { mutableStateOf<FileEntity?>(null) }
    var renameDoc by remember { mutableStateOf<FileEntity?>(null) }
    var watermarkDoc by remember { mutableStateOf<FileEntity?>(null) }
    var signatureDoc by remember { mutableStateOf<FileEntity?>(null) }

    val pdfImporter = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            searchViewModel.importUris(uris)
            toolsViewModel.postToast("Importing & indexing ${uris.size} document(s)…")
        }
    }

    val filtered = remember(docs, filterMode) {
        when (filterMode) {
            "scanned" -> docs.filter { it.isScanned }
            "pdfs" -> docs.filter { it.extension.equals("pdf", true) }
            "cards" -> docs.filter { it.isCard }
            else -> docs
        }
    }

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
                        onClick = { isGridView = !isGridView },
                        modifier = Modifier.size(48.dp).testTag("docs_view_toggle_btn")
                    ) {
                        Icon(
                            if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                            contentDescription = "Toggle List or Grid",
                            tint = palette.text
                        )
                    }
                    IconButton(
                        onClick = { onNavigate(PageOrganizerRoute()) },
                        modifier = Modifier.size(48.dp).testTag("docs_organizer_shortcut_btn")
                    ) {
                        Icon(Icons.Rounded.Layers, contentDescription = "Open Page Organizer", tint = palette.accent)
                    }
                }
            )

            // Action & Filter Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.surface)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(
                    onClick = { onNavigate(DocScannerRoute("batch")) },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                    modifier = Modifier.weight(1f).testTag("docs_scan_pdf_btn")
                ) {
                    Icon(Icons.Rounded.DocumentScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Scan Multi-Page")
                }
                OutlinedButton(
                    onClick = { pdfImporter.launch(arrayOf("application/pdf", "image/*")) },
                    modifier = Modifier.weight(1f).testTag("docs_import_pdf_btn")
                ) {
                    Icon(Icons.Rounded.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Import PDF")
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
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                .clip(RoundedCornerShape(16.dp))
                                .clickable {
                                    if (doc.extension.equals("pdf", true)) {
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
                        DocumentListRow(
                            doc = doc,
                            engine = toolsViewModel.engine,
                            onClick = { previewDoc = doc },
                            onOpenPdfViewer = { onNavigate(PdfViewerRoute(doc.id, doc.uri, doc.name)) },
                            onOrganize = { onNavigate(PageOrganizerRoute(doc.uri, doc.name)) },
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
            onOpenSignature = { signatureDoc = fresh },
            onOpenPageOrganizer = {
                previewDoc = null
                onNavigate(PageOrganizerRoute(fresh.uri, fresh.name))
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

    signatureDoc?.let { doc ->
        DocumentSignatureDialog(
            onDismiss = { signatureDoc = null },
            onApply = { bmp ->
                toolsViewModel.applyImageSignature(doc, bmp)
                signatureDoc = null
            }
        )
    }
}

@Composable
private fun DocumentListRow(
    doc: FileEntity,
    engine: com.filelenspro.app.service.OcrAndPdfEngine,
    onClick: () -> Unit,
    onOpenPdfViewer: () -> Unit,
    onOrganize: () -> Unit,
    onRerunOcr: () -> Unit,
    onPromoteToCard: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalFileLensColors.current
    var showMenu by remember { mutableStateOf(false) }

    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
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
