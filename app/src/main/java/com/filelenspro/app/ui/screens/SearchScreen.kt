package com.filelenspro.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.R
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.SearchMode
import com.filelenspro.app.data.model.SearchResult
import com.filelenspro.app.data.model.SortColumn
import com.filelenspro.app.domain.engine.SearchEngine
import com.filelenspro.app.ui.components.DocumentPreviewDialog
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.FileThumbnail
import com.filelenspro.app.ui.components.SearchFilterSheet
import com.filelenspro.app.ui.components.buildHighlightedText
import com.filelenspro.app.ui.navigation.DocScannerRoute
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@Composable
fun SearchScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val focusManager = LocalFocusManager.current

    val query by searchViewModel.searchQuery.collectAsState()
    val mode by searchViewModel.searchMode.collectAsState()
    val sortCol by searchViewModel.sortColumn.collectAsState()
    val sortOrder by searchViewModel.sortOrder.collectAsState()
    val filters by searchViewModel.filters.collectAsState()
    val results by searchViewModel.searchResults.collectAsState()
    val isSearching by searchViewModel.isSearching.collectAsState()
    val elapsedMs by searchViewModel.searchElapsedMs.collectAsState()
    val isIndexing by searchViewModel.isIndexing.collectAsState()
    val indexProgress by searchViewModel.indexProgress.collectAsState()
    val stats by searchViewModel.indexStats.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val allFiles by searchViewModel.allFiles.collectAsState()

    var showFilterSheet by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }
    var previewFile by remember { mutableStateOf<FileEntity?>(null) }
    var showWatermarkFor by remember { mutableStateOf<FileEntity?>(null) }
    var showSignatureFor by remember { mutableStateOf<FileEntity?>(null) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            searchViewModel.importUris(uris)
            toolsViewModel.postToast("Indexing ${uris.size} file(s)…")
        }
    }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(25)) { uris ->
        if (uris.isNotEmpty()) {
            searchViewModel.importUris(uris)
            toolsViewModel.postToast("Running ML Kit OCR on ${uris.size} photo(s)…")
        }
    }
    val folderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { treeUri: Uri? ->
        if (treeUri != null) {
            toolsViewModel.postToast("Syncing linked folder…")
            searchViewModel.addSafFolder(treeUri) { added ->
                toolsViewModel.postToast("Auto-indexed $added file(s) from folder")
            }
        }
    }

    val bookmarkedUris = remember(bookmarks) { bookmarks.map { it.fileUri }.toSet() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        FileLensTopBar(
            title = "FileSearchPro",
            subtitle = "${stats.totalFiles} indexed · ${stats.ocrDone} OCR · ${stats.cardsCount} cards",
            onOpenQuickNav = onOpenQuickNav,
            actions = {
                IconButton(
                    onClick = {
                        searchViewModel.syncIndex(forceReindex = false) { updated ->
                            toolsViewModel.postToast(
                                if (updated > 0) "Auto-indexed $updated new/updated file(s)" else "All vault & folder files up to date"
                            )
                        }
                    },
                    modifier = Modifier.size(48.dp).testTag("auto_sync_index_btn")
                ) {
                    Icon(Icons.Rounded.Sync, contentDescription = "Sync & Re-Index New Files", tint = palette.accent)
                }
                IconButton(
                    onClick = { onNavigate(DocScannerRoute()) },
                    modifier = Modifier.size(48.dp).testTag("search_header_scanner_btn")
                ) {
                    Icon(Icons.Rounded.DocumentScanner, contentDescription = "Open Multi-Page Scanner", tint = palette.text)
                }
            }
        )

        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
        ) {
            // Search Input Box
            Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { searchViewModel.setQuery(it) },
                        placeholder = {
                            Text("Search files, OCR text, IDs, bills…", color = palette.dim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                        trailingIcon = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (query.isNotBlank()) {
                                    IconButton(onClick = {
                                        searchViewModel.saveCurrentSearch()
                                        toolsViewModel.postToast("Saved search \"$query\"")
                                    }, modifier = Modifier.testTag("save_search_btn")) {
                                        Icon(Icons.Rounded.BookmarkAdd, contentDescription = "Save Search", tint = palette.accent)
                                    }
                                    IconButton(onClick = { searchViewModel.setQuery("") }, modifier = Modifier.testTag("clear_search_btn")) {
                                        Icon(Icons.Rounded.Close, contentDescription = "Clear Search", tint = palette.muted)
                                    }
                                }
                            }
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = {
                            searchViewModel.triggerSearch(immediate = true)
                            focusManager.clearFocus()
                        }),
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.accent,
                            unfocusedBorderColor = palette.border,
                            focusedContainerColor = palette.surface2.copy(alpha = 0.45f),
                            unfocusedContainerColor = palette.surface2.copy(alpha = 0.45f)
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("main_search_input")
                    )

                    Spacer(Modifier.height(8.dp))

                    // Mode Pills
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        SearchMode.entries.forEach { m ->
                            val selected = mode == m
                            FilterChip(
                                selected = selected,
                                onClick = { searchViewModel.setMode(m) },
                                label = { Text(m.label) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = palette.accent,
                                    selectedLabelColor = Color.White
                                ),
                                modifier = Modifier.testTag("mode_chip_${m.id}")
                            )
                        }
                    }

                    // Sort, Filter & Quick Add Bar
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box {
                            AssistChip(
                                onClick = { showSortMenu = true },
                                label = { Text("Sort: ${sortCol.label} ${if (sortOrder.name == "ASC") "↑" else "↓"}") },
                                modifier = Modifier.testTag("sort_chip")
                            )
                            DropdownMenu(expanded = showSortMenu, onDismissRequest = { showSortMenu = false }) {
                                SortColumn.entries.forEach { col ->
                                    DropdownMenuItem(
                                        text = { Text(col.label) },
                                        onClick = {
                                            searchViewModel.toggleSort(col)
                                            showSortMenu = false
                                        }
                                    )
                                }
                            }
                        }
                        FilterChip(
                            selected = filters.isActive,
                            onClick = { showFilterSheet = true },
                            leadingIcon = { Icon(Icons.Rounded.FilterList, contentDescription = null, modifier = Modifier.size(16.dp)) },
                            label = { Text(if (filters.isActive) "Filtered" else "Filter") },
                            modifier = Modifier.testTag("filter_chip")
                        )
                        Spacer(Modifier.weight(1f))
                        if (query.isNotBlank()) {
                            Text(
                                "${results.size} hits · ${elapsedMs}ms",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.muted
                            )
                        }
                    }
                }
            }

            // Indexing Progress Card
            if (isIndexing) {
                Surface(
                    color = palette.accent.copy(alpha = 0.1f),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "Indexing ${indexProgress?.indexed ?: 0}/${indexProgress?.total ?: 0}: ${indexProgress?.currentFile.orEmpty()}",
                                style = MaterialTheme.typography.labelLarge,
                                color = palette.accent,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            TextButton(onClick = { searchViewModel.cancelIndexing() }) { Text("Cancel") }
                        }
                        val total = (indexProgress?.total ?: 1).coerceAtLeast(1)
                        val done = (indexProgress?.indexed ?: 0).coerceIn(0, total)
                        LinearProgressIndicator(
                            progress = { done.toFloat() / total.toFloat() },
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp))
                        )
                    }
                }
            }

            if (isSearching) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            // Body: Results OR Empty / Quick Onboarding
            if (query.isBlank()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(20.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(20.dp))
                        ) {
                            Column(
                                modifier = Modifier.padding(18.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.img_empty_search),
                                    contentDescription = "Offline Document Index Illustration",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(148.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                )
                                Spacer(Modifier.height(12.dp))
                                Text(
                                    if (allFiles.isEmpty()) "Index & Search Offline" else "${allFiles.size} Documents Ready",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = palette.text,
                                    textAlign = TextAlign.Center
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Add PDFs, photos, or link an auto-synced folder. ML Kit OCR extracts English & Hindi text locally in seconds.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = palette.muted,
                                    textAlign = TextAlign.Center
                                )
                                Spacer(Modifier.height(14.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Button(
                                        onClick = { filePicker.launch(arrayOf("application/pdf", "image/*", "text/*")) },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                        modifier = Modifier.weight(1f).testTag("pick_files_btn")
                                    ) {
                                        Icon(Icons.Rounded.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Add Files")
                                    }
                                    FilledTonalButton(
                                        onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                        modifier = Modifier.weight(1f).testTag("pick_photos_btn")
                                    ) {
                                        Icon(Icons.Rounded.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Photos OCR")
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    OutlinedButton(
                                        onClick = { onNavigate(DocScannerRoute()) },
                                        modifier = Modifier.weight(1f).testTag("quick_scan_btn")
                                    ) {
                                        Icon(Icons.Rounded.DocumentScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Fast Scan")
                                    }
                                    OutlinedButton(
                                        onClick = { folderPicker.launch(null) },
                                        modifier = Modifier.weight(1f).testTag("link_folder_btn")
                                    ) {
                                        Icon(Icons.Rounded.CreateNewFolder, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Auto Folder")
                                    }
                                }
                            }
                        }
                    }

                    if (allFiles.isNotEmpty()) {
                        item {
                            Text("Recently Indexed", style = MaterialTheme.typography.titleMedium, color = palette.text)
                        }
                        items(allFiles.take(12), key = { it.id }) { file ->
                            SearchFileRow(
                                file = file,
                                previewSnippet = (file.ocrText ?: file.contentText ?: "").replace(Regex("\\s+"), " ").take(110),
                                query = "",
                                badgeText = if (file.customTag.isNotBlank()) file.customTag else file.extension.uppercase(),
                                engine = toolsViewModel.engine,
                                onClick = { previewFile = file }
                            )
                        }
                    }
                }
            } else if (results.isEmpty() && !isSearching) {
                Box(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No matching documents", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Try Quick Search for Hinglish/Hindi cross-matching or Natural Language for semantic discovery.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(results, key = { it.entry.id }) { res: SearchResult ->
                        SearchFileRow(
                            file = res.entry,
                            previewSnippet = res.preview,
                            query = query,
                            badgeText = if (res.semanticScore != null) "${(res.semanticScore * 100).toInt()}% match" else "${res.matchCount} hits",
                            engine = toolsViewModel.engine,
                            onClick = { previewFile = res.entry }
                        )
                    }
                }
            }
        }
    }

    if (showFilterSheet) {
        SearchFilterSheet(
            current = filters,
            onDismiss = { showFilterSheet = false },
            onApply = { searchViewModel.setFilters(it) }
        )
    }

    previewFile?.let { file ->
        val fresh = allFiles.firstOrNull { it.id == file.id } ?: file
        DocumentPreviewDialog(
            file = fresh,
            searchQuery = query,
            isBookmarked = fresh.uri in bookmarkedUris,
            engine = toolsViewModel.engine,
            onDismiss = { previewFile = null },
            onToggleBookmark = { searchViewModel.toggleBookmark(fresh) },
            onRerunOcr = { toolsViewModel.rerunOcrForFile(fresh) },
            onPromoteToCard = { toolsViewModel.promoteFileToCard(fresh, fresh.customTag.ifBlank { "Document" }) },
            onOpenWatermark = { showWatermarkFor = fresh },
            onOpenSignature = { showSignatureFor = fresh },
            onOpenPageOrganizer = {
                previewFile = null
                onNavigate(PageOrganizerRoute(fresh.uri, fresh.name))
            }
        )
    }

    showWatermarkFor?.let { file ->
        DocumentWatermarkDialog(
            onDismiss = { showWatermarkFor = null },
            onApply = { txt, col, alpha ->
                toolsViewModel.applyImageWatermark(file, txt, col, alpha)
                showWatermarkFor = null
            }
        )
    }

    showSignatureFor?.let { file ->
        DocumentSignatureDialog(
            onDismiss = { showSignatureFor = null },
            onApply = { bmp ->
                toolsViewModel.applyImageSignature(file, bmp)
                showSignatureFor = null
            }
        )
    }
}

@Composable
private fun SearchFileRow(
    file: FileEntity,
    previewSnippet: String,
    query: String,
    badgeText: String,
    engine: com.filelenspro.app.service.OcrAndPdfEngine,
    onClick: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val occs = remember(previewSnippet, query) {
        if (query.isBlank()) emptyList() else SearchEngine.findOccurrences(previewSnippet, query)
    }
    val annotated = remember(previewSnippet, occs) {
        buildHighlightedText(previewSnippet, occs, 0, palette.highlight, palette.highlightCurrent)
    }

    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .testTag("search_result_${file.id}")
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            FileThumbnail(file = file, engine = engine, modifier = Modifier.size(56.dp))
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        file.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(6.dp))
                    Surface(
                        color = palette.accent.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            badgeText,
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.accent,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    "${FormatUtils.formatSize(file.size)} · ${FormatUtils.formatDate(file.modified)}${if (file.pageCount > 1) " · ${file.pageCount}p" else ""}",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.muted
                )
                if (previewSnippet.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        annotated,
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
