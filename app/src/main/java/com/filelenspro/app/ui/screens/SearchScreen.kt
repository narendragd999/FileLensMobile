package com.filelenspro.app.ui.screens

import android.Manifest
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Compress
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.FolderZip
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MergeType
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Sort
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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
import com.filelenspro.app.ui.components.AllFilesPermissionDialog
import com.filelenspro.app.ui.components.DocumentPreviewDialog
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.FileThumbnail
import com.filelenspro.app.ui.components.LastIndexSummaryStrip
import com.filelenspro.app.ui.components.RichIndexingProgressBanner
import com.filelenspro.app.ui.components.SearchFilterSheet
import com.filelenspro.app.ui.components.TagManagementDialog
import com.filelenspro.app.ui.components.buildHighlightedText
import com.filelenspro.app.ui.navigation.DocScannerRoute
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.navigation.SavedSearchesRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import com.filelenspro.app.util.StoragePermissionHelper

private val QUICK_CONCEPT_CHIPS = listOf(
    "Aadhaar", "PAN", "Invoice", "Bill", "Prescription", "Vehicle RC", "Passport", "Marksheet"
)

@Composable
fun SearchScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
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
    val lastSummary by searchViewModel.lastIndexSummary.collectAsState()
    val hasAllFiles by searchViewModel.hasAllFilesPermission.collectAsState()
    val stats by searchViewModel.indexStats.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val savedSearches by searchViewModel.savedSearches.collectAsState()
    val indexTargets by searchViewModel.indexTargets.collectAsState()
    val allFiles by searchViewModel.allFiles.collectAsState()
    val savedSignatures by toolsViewModel.savedSignatures.collectAsState()

    var showFilterSheet by remember { mutableStateOf(false) }
    var showModeMenu by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }
    var showAllFilesDialog by remember { mutableStateOf(false) }
    var previewFile by remember { mutableStateOf<FileEntity?>(null) }
    var showWatermarkFor by remember { mutableStateOf<FileEntity?>(null) }
    var showSignatureFor by remember { mutableStateOf<Pair<FileEntity, Int>?>(null) }
    var selectedFileIds by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var showBatchTagDialog by remember { mutableStateOf(false) }
    var showBatchMergeDialog by remember { mutableStateOf(false) }

    val selectedFiles = remember(allFiles, selectedFileIds) { allFiles.filter { it.id in selectedFileIds } }
    val inSelectionMode = selectedFileIds.isNotEmpty()

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
    val legacyReadPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        searchViewModel.refreshStoragePermission()
        toolsViewModel.refreshFolderRoots()
        if (granted) {
            toolsViewModel.postToast("Storage access granted! Indexing entire device…")
            searchViewModel.indexEntireDevice(forceReindex = false) { summary ->
                if (summary != null) {
                    toolsViewModel.postToast("Indexed +${summary.newOrUpdated} files (${summary.skippedUnchanged} unchanged skipped)")
                }
            }
        } else {
            toolsViewModel.postToast("Storage permission denied. You can still use Auto Folder or Add Files.")
        }
    }

    fun triggerEntireDeviceIndex(forceReindex: Boolean = false) {
        if (hasAllFiles || StoragePermissionHelper.hasAllFilesAccess(context)) {
            searchViewModel.refreshStoragePermission()
            toolsViewModel.postToast(
                if (forceReindex) "Starting full device re-index…" else "Starting incremental device index…"
            )
            searchViewModel.indexEntireDevice(forceReindex = forceReindex) { summary ->
                if (summary != null) {
                    val msg = if (summary.wasCancelled) {
                        "Indexing paused (+${summary.newOrUpdated} saved)"
                    } else {
                        "Done: +${summary.newOrUpdated} new/updated · ${summary.skippedUnchanged} unchanged skipped"
                    }
                    toolsViewModel.postToast(msg)
                }
            }
        } else {
            showAllFilesDialog = true
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
            subtitle = "${stats.totalFiles} files · ${stats.ocrDone} OCR · ${stats.cardsCount} cards",
            onOpenQuickNav = onOpenQuickNav,
            actions = {
                IconButton(
                    onClick = {
                        searchViewModel.syncIndex(forceReindex = false) { updated ->
                            toolsViewModel.postToast(
                                if (updated > 0) "Incremental sync indexed +$updated file(s)" else "All files are already up to date"
                            )
                        }
                    },
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("auto_sync_index_btn")
                ) {
                    Icon(Icons.Rounded.Sync, contentDescription = "Incremental Sync New Files", tint = palette.accent)
                }
                IconButton(
                    onClick = { onNavigate(DocScannerRoute()) },
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("search_header_scanner_btn")
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
            // Compact Search Bar + Single Unified Control Strip (maximizes result area!)
            Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { searchViewModel.setQuery(it) },
                        placeholder = {
                            Text(
                                "Search files, OCR text, IDs, bills…",
                                color = palette.dim,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                        trailingIcon = {
                            if (query.isNotBlank()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    IconButton(
                                        onClick = {
                                            searchViewModel.saveCurrentSearch()
                                            toolsViewModel.postToast("Saved search \"$query\"")
                                        },
                                        modifier = Modifier.testTag("save_search_btn")
                                    ) {
                                        Icon(Icons.Rounded.BookmarkAdd, contentDescription = "Save Search", tint = palette.accent)
                                    }
                                    IconButton(
                                        onClick = { searchViewModel.setQuery("") },
                                        modifier = Modifier.testTag("clear_search_btn")
                                    ) {
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
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.accent,
                            unfocusedBorderColor = palette.border,
                            focusedContainerColor = palette.surface2.copy(alpha = 0.55f),
                            unfocusedContainerColor = palette.surface2.copy(alpha = 0.45f)
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("main_search_input")
                    )

                    Spacer(Modifier.height(7.dp))

                    // Single compact utility row: Mode ▾ | Sort ▾ | Filter | Hits
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Search Mode Dropdown Pill
                        Box {
                            CompactControlPill(
                                label = mode.label,
                                leadingIcon = Icons.Rounded.Tune,
                                trailingIcon = Icons.Rounded.KeyboardArrowDown,
                                active = true,
                                onClick = { showModeMenu = true },
                                tag = "mode_selector_pill"
                            )
                            DropdownMenu(expanded = showModeMenu, onDismissRequest = { showModeMenu = false }) {
                                SearchMode.entries.forEach { m ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                m.label,
                                                fontWeight = if (m == mode) FontWeight.Bold else FontWeight.Normal,
                                                color = if (m == mode) palette.accent else palette.text
                                            )
                                        },
                                        trailingIcon = {
                                            if (m == mode) {
                                                Icon(Icons.Rounded.Check, contentDescription = null, tint = palette.accent, modifier = Modifier.size(16.dp))
                                            }
                                        },
                                        onClick = {
                                            searchViewModel.setMode(m)
                                            showModeMenu = false
                                        },
                                        modifier = Modifier.testTag("mode_chip_${m.id}")
                                    )
                                }
                            }
                        }

                        // Sort Dropdown Pill
                        Box {
                            CompactControlPill(
                                label = "${sortCol.label} ${if (sortOrder.name == "ASC") "↑" else "↓"}",
                                leadingIcon = Icons.Rounded.Sort,
                                active = false,
                                onClick = { showSortMenu = true },
                                tag = "sort_chip"
                            )
                            DropdownMenu(expanded = showSortMenu, onDismissRequest = { showSortMenu = false }) {
                                SortColumn.entries.forEach { col ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                col.label,
                                                fontWeight = if (col == sortCol) FontWeight.Bold else FontWeight.Normal,
                                                color = if (col == sortCol) palette.accent else palette.text
                                            )
                                        },
                                        onClick = {
                                            searchViewModel.toggleSort(col)
                                            showSortMenu = false
                                        }
                                    )
                                }
                            }
                        }

                        // Filter Pill
                        CompactControlPill(
                            label = if (filters.isActive) "Filtered" else "Filter",
                            leadingIcon = Icons.Rounded.FilterList,
                            active = filters.isActive,
                            onClick = { showFilterSheet = true },
                            tag = "filter_chip"
                        )

                        Spacer(Modifier.weight(1f))

                        if (query.isNotBlank()) {
                            Text(
                                "${results.size} hits · ${elapsedMs}ms",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.accent,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                        } else if (allFiles.isNotEmpty()) {
                            Text(
                                "${allFiles.size} docs",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.muted,
                                maxLines = 1
                            )
                        }
                    }
                }
            }

            HorizontalDivider(thickness = 1.dp, color = palette.border.copy(alpha = 0.7f))

            // Live Indexing Progress Banner (only visible during active indexing)
            RichIndexingProgressBanner(
                isIndexing = isIndexing,
                progress = indexProgress,
                onCancel = { searchViewModel.cancelIndexing() },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
            )

            if (isSearching) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            // Contextual Multi-Select Batch Action Bar (triggered by long-pressing any file)
            if (inSelectionMode) {
                val pdfsSelected = selectedFiles.count { it.extension.equals("pdf", true) }
                val photosSelected = selectedFiles.count { it.extension.lowercase() in setOf("jpg", "jpeg", "png", "webp") }
                Surface(
                    color = palette.accent.copy(alpha = 0.12f),
                    modifier = Modifier.fillMaxWidth().testTag("search_batch_bar")
                ) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            Text(
                                "${selectedFiles.size} selected · Long-press mode",
                                style = MaterialTheme.typography.labelLarge,
                                color = palette.accent,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { selectedFileIds = emptySet() },
                                modifier = Modifier.size(34.dp).testTag("search_batch_close_btn")
                            ) {
                                Icon(Icons.Rounded.Close, contentDescription = "Clear Selection", tint = palette.text, modifier = Modifier.size(18.dp))
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            if (pdfsSelected >= 2) {
                                QuickActionPill(
                                    label = "Merge PDFs ($pdfsSelected)",
                                    icon = Icons.Rounded.MergeType,
                                    tint = palette.accent,
                                    tag = "search_batch_merge_btn",
                                    onClick = { showBatchMergeDialog = true }
                                )
                            }
                            QuickActionPill(
                                label = "Share ZIP",
                                icon = Icons.Rounded.FolderZip,
                                tint = palette.purpleAccent,
                                tag = "search_batch_zip_btn",
                                onClick = {
                                    toolsViewModel.shareBatchAsZip(context, selectedFiles)
                                    selectedFileIds = emptySet()
                                }
                            )
                            QuickActionPill(
                                label = "Tag Cards",
                                icon = Icons.Rounded.CreditCard,
                                tint = palette.warning,
                                tag = "search_batch_tag_btn",
                                onClick = { showBatchTagDialog = true }
                            )
                            if (photosSelected > 0) {
                                QuickActionPill(
                                    label = "Shrink Photos ($photosSelected)",
                                    icon = Icons.Rounded.Compress,
                                    tint = palette.success,
                                    tag = "search_batch_shrink_btn",
                                    onClick = {
                                        toolsViewModel.compressBatchPhotos(selectedFiles)
                                        selectedFileIds = emptySet()
                                    }
                                )
                            }
                        }
                    }
                }
            }

            // Main Body: Clean Search Results OR Clean, Airy Home Workspace
            if (query.isBlank()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Single Sleek Device Index Bar (replaces bulky stacked cards)
                    item {
                        CompactDeviceIndexBar(
                            hasAllFiles = hasAllFiles,
                            isIndexing = isIndexing,
                            onIndexEntireDevice = { triggerEntireDeviceIndex(forceReindex = false) },
                            onForceReindex = { triggerEntireDeviceIndex(forceReindex = true) }
                        )
                    }

                    // Slim Horizontal Quick Actions Strip (zero outer box clutter)
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            QuickActionPill(
                                label = "Add Files",
                                icon = Icons.Rounded.UploadFile,
                                tint = palette.accent,
                                tag = "pick_files_btn",
                                onClick = { filePicker.launch(arrayOf("application/pdf", "image/*", "text/*")) }
                            )
                            QuickActionPill(
                                label = "Photos OCR",
                                icon = Icons.Rounded.PhotoLibrary,
                                tint = palette.purpleAccent,
                                tag = "pick_photos_btn",
                                onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                            )
                            QuickActionPill(
                                label = "Fast Scan",
                                icon = Icons.Rounded.DocumentScanner,
                                tint = palette.success,
                                tag = "quick_scan_btn",
                                onClick = { onNavigate(DocScannerRoute()) }
                            )
                            QuickActionPill(
                                label = if (indexTargets.isNotEmpty()) "Folders (${indexTargets.size})" else "Auto Folder",
                                icon = Icons.Rounded.CreateNewFolder,
                                tint = palette.warning,
                                tag = "link_folder_btn",
                                onClick = { folderPicker.launch(null) }
                            )
                        }
                    }

                    // Compact Sync Telemetry Strip (only after an index run)
                    if (lastSummary != null && !isIndexing) {
                        item {
                            LastIndexSummaryStrip(summary = lastSummary)
                        }
                    }

                    // Unified Slim Quick Concepts + Saved Searches Row
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            savedSearches.take(4).forEach { saved ->
                                ConceptPill(
                                    label = saved.query,
                                    isSaved = true,
                                    onClick = { searchViewModel.runSavedSearch(saved.query, saved.mode) }
                                )
                            }
                            QUICK_CONCEPT_CHIPS.forEach { concept ->
                                ConceptPill(
                                    label = concept,
                                    isSaved = false,
                                    tag = "quick_concept_$concept",
                                    onClick = {
                                        searchViewModel.setQuery(concept)
                                        searchViewModel.triggerSearch(immediate = true)
                                    }
                                )
                            }
                            if (savedSearches.isNotEmpty()) {
                                TextButton(
                                    onClick = { onNavigate(SavedSearchesRoute) },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                                ) {
                                    Text("Saved (${savedSearches.size})", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }

                    if (allFiles.isEmpty()) {
                        // Clean Empty Onboarding State
                        item {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 20.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.img_empty_search),
                                    contentDescription = "Offline Document Index Illustration",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(144.dp)
                                        .clip(RoundedCornerShape(16.dp))
                                )
                                Text(
                                    "Your Offline Document Vault",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.text,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "Index your entire device at once or import PDFs, bills, and photos for instant on-device OCR search.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = palette.muted,
                                    textAlign = TextAlign.Center
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Button(
                                        onClick = { triggerEntireDeviceIndex(forceReindex = false) },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Rounded.PhoneAndroid, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Index Device")
                                    }
                                    OutlinedButton(
                                        onClick = { filePicker.launch(arrayOf("application/pdf", "image/*", "text/*")) },
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Rounded.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Import Files")
                                    }
                                }
                            }
                        }
                    } else {
                        // Clean Section Label + Immediate Document Feed
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 2.dp, bottom = 2.dp, start = 2.dp, end = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    "Indexed Documents",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = palette.muted,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    "Showing ${allFiles.size.coerceAtMost(40)} of ${allFiles.size}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.dim
                                )
                            }
                        }
                        items(allFiles.take(40), key = { it.id }) { file ->
                            val isSel = file.id in selectedFileIds
                            SearchFileRow(
                                file = file,
                                previewSnippet = (file.ocrText ?: file.contentText ?: "").replace(Regex("\\s+"), " ").take(110),
                                query = "",
                                badgeText = if (file.customTag.isNotBlank()) file.customTag else file.extension.uppercase(),
                                matchedPages = emptyList(),
                                engine = toolsViewModel.engine,
                                selectionMode = inSelectionMode,
                                isSelected = isSel,
                                onClick = {
                                    if (inSelectionMode) {
                                        selectedFileIds = if (isSel) selectedFileIds - file.id else selectedFileIds + file.id
                                    } else {
                                        previewFile = file
                                    }
                                },
                                onLongClick = {
                                    selectedFileIds = if (isSel) selectedFileIds - file.id else selectedFileIds + file.id
                                }
                            )
                        }
                    }
                }
            } else if (results.isEmpty() && !isSearching) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No matching documents", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Switch Mode to Quick Search for Hinglish/Hindi matching or Natural Language for semantic discovery.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                // Full-screen clean search results list (~80% viewport space!)
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(results, key = { it.entry.id }) { res: SearchResult ->
                        val isSel = res.entry.id in selectedFileIds
                        SearchFileRow(
                            file = res.entry,
                            previewSnippet = res.preview,
                            query = query,
                            badgeText = if (res.semanticScore != null) "${(res.semanticScore * 100).toInt()}% match" else "${res.matchCount} hits",
                            matchedPages = res.pageNumbers,
                            engine = toolsViewModel.engine,
                            selectionMode = inSelectionMode,
                            isSelected = isSel,
                            onClick = {
                                if (inSelectionMode) {
                                    selectedFileIds = if (isSel) selectedFileIds - res.entry.id else selectedFileIds + res.entry.id
                                } else {
                                    previewFile = res.entry
                                }
                            },
                            onLongClick = {
                                selectedFileIds = if (isSel) selectedFileIds - res.entry.id else selectedFileIds + res.entry.id
                            }
                        )
                    }
                }
            }
        }
    }

    if (showAllFilesDialog) {
        AllFilesPermissionDialog(
            onGrantPermission = {
                showAllFilesDialog = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val launched = StoragePermissionHelper.launchAllFilesAccessSettings(context)
                    if (!launched) {
                        toolsViewModel.postToast("Open Settings → Apps → FileSearchPro → All files access")
                    }
                } else {
                    legacyReadPermLauncher.launch(Manifest.permission.READ_EXTERNAL_STORAGE)
                }
            },
            onUseFolderPicker = {
                showAllFilesDialog = false
                folderPicker.launch(null)
            },
            onDismiss = { showAllFilesDialog = false }
        )
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
            onOpenSignature = { pageIdx -> showSignatureFor = fresh to pageIdx },
            onOpenPageOrganizer = {
                previewFile = null
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

    if (showBatchTagDialog) {
        TagManagementDialog(
            currentTag = "Document",
            onDismiss = { showBatchTagDialog = false },
            onSave = { tag ->
                toolsViewModel.bulkPromoteToCards(selectedFiles, tag)
                showBatchTagDialog = false
                selectedFileIds = emptySet()
            }
        )
    }

    if (showBatchMergeDialog) {
        var mergeTitle by remember { mutableStateOf("Merged_${System.currentTimeMillis() % 10000}") }
        AlertDialog(
            onDismissRequest = { showBatchMergeDialog = false },
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
                    toolsViewModel.mergeSelectedPdfs(selectedFiles, mergeTitle)
                    showBatchMergeDialog = false
                    selectedFileIds = emptySet()
                }) { Text("Merge") }
            },
            dismissButton = { TextButton(onClick = { showBatchMergeDialog = false }) { Text("Cancel") } }
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

    showSignatureFor?.let { (file, pageIdx) ->
        DocumentSignatureDialog(
            onDismiss = { showSignatureFor = null },
            onApply = { bmp ->
                toolsViewModel.applyImageSignature(file, bmp, pageIdx)
                showSignatureFor = null
            },
            savedSignatures = savedSignatures,
            onSaveSignatureForReuse = { toolsViewModel.saveSignatureForReuse(it) },
            onDeleteSavedSignature = { toolsViewModel.deleteSavedSignature(it) },
            onApplyWithPlacement = { bmp, placement ->
                toolsViewModel.applyImageSignature(file, bmp, pageIdx, placement)
                showSignatureFor = null
            }
        )
    }
}

@Composable
private fun CompactControlPill(
    label: String,
    leadingIcon: ImageVector,
    trailingIcon: ImageVector? = null,
    active: Boolean,
    onClick: () -> Unit,
    tag: String
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = if (active) palette.accent.copy(alpha = 0.13f) else palette.surface2,
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .border(
                width = 1.dp,
                color = if (active) palette.accent.copy(alpha = 0.35f) else palette.border,
                shape = RoundedCornerShape(10.dp)
            )
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .testTag(tag)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                leadingIcon,
                contentDescription = null,
                tint = if (active) palette.accent else palette.muted,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = if (active) palette.accent else palette.text,
                fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1
            )
            if (trailingIcon != null) {
                Icon(
                    trailingIcon,
                    contentDescription = null,
                    tint = if (active) palette.accent else palette.muted,
                    modifier = Modifier.size(15.dp)
                )
            }
        }
    }
}

@Composable
private fun CompactDeviceIndexBar(
    hasAllFiles: Boolean,
    isIndexing: Boolean,
    onIndexEntireDevice: () -> Unit,
    onForceReindex: () -> Unit
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = palette.accent.copy(alpha = 0.08f),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, palette.accent.copy(alpha = 0.22f), RoundedCornerShape(14.dp))
            .testTag("entire_device_hero_card")
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(palette.accent.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (hasAllFiles) Icons.Rounded.CheckCircle else Icons.Rounded.PhoneAndroid,
                    contentDescription = null,
                    tint = if (hasAllFiles) palette.success else palette.accent,
                    modifier = Modifier.size(19.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Entire Device Index",
                    style = MaterialTheme.typography.labelLarge,
                    color = palette.text,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
                Text(
                    text = if (hasAllFiles) "Incremental sync · skips unchanged" else "All files access for 1-tap full scan",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (hasAllFiles) {
                IconButton(
                    enabled = !isIndexing,
                    onClick = onForceReindex,
                    modifier = Modifier
                        .size(36.dp)
                        .testTag("hero_secondary_index_btn")
                ) {
                    Icon(
                        Icons.Rounded.Refresh,
                        contentDescription = "Full Re-index Device",
                        tint = palette.accent,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            Button(
                onClick = onIndexEntireDevice,
                enabled = !isIndexing,
                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                shape = RoundedCornerShape(10.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                modifier = Modifier.testTag("index_entire_device_btn")
            ) {
                Text(
                    text = if (hasAllFiles) "Index All" else "Allow & Scan",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun QuickActionPill(
    label: String,
    icon: ImageVector,
    tint: Color,
    tag: String,
    onClick: () -> Unit
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = palette.surface,
        shape = RoundedCornerShape(11.dp),
        modifier = Modifier
            .border(1.dp, palette.border, RoundedCornerShape(11.dp))
            .clip(RoundedCornerShape(11.dp))
            .clickable(onClick = onClick)
            .testTag(tag)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = palette.text,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun ConceptPill(
    label: String,
    isSaved: Boolean,
    tag: String? = null,
    onClick: () -> Unit
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = if (isSaved) palette.accent.copy(alpha = 0.1f) else palette.surface2,
        shape = RoundedCornerShape(9.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(9.dp))
            .clickable(onClick = onClick)
            .let { if (tag != null) it.testTag(tag) else it }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (isSaved) {
                Icon(Icons.Rounded.History, contentDescription = null, tint = palette.accent, modifier = Modifier.size(13.dp))
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = if (isSaved) palette.accent else palette.textSecondary,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SearchFileRow(
    file: FileEntity,
    previewSnippet: String,
    query: String,
    badgeText: String,
    matchedPages: List<Int>,
    engine: com.filelenspro.app.service.OcrAndPdfEngine,
    selectionMode: Boolean = false,
    isSelected: Boolean = false,
    onClick: () -> Unit,
    onLongClick: () -> Unit = {}
) {
    val palette = LocalFileLensColors.current
    val occs = remember(previewSnippet, query) {
        if (query.isBlank()) emptyList() else SearchEngine.findOccurrences(previewSnippet, query)
    }
    val annotated = remember(previewSnippet, occs) {
        buildHighlightedText(previewSnippet, occs, 0, palette.highlight, palette.highlightCurrent)
    }

    Surface(
        color = if (isSelected) palette.accent.copy(alpha = 0.1f) else palette.surface,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = if (isSelected) 2.dp else 1.dp,
                color = if (isSelected) palette.accent else palette.border.copy(alpha = 0.8f),
                shape = RoundedCornerShape(14.dp)
            )
            .clip(RoundedCornerShape(14.dp))
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .testTag("search_result_${file.id}")
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (selectionMode) {
                Icon(
                    if (isSelected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                    contentDescription = "Select File",
                    tint = if (isSelected) palette.accent else palette.muted,
                    modifier = Modifier.padding(end = 8.dp).size(22.dp)
                )
            }
            FileThumbnail(file = file, engine = engine, modifier = Modifier.size(48.dp))
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        file.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = palette.text,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(6.dp))
                    Surface(
                        color = palette.accent.copy(alpha = 0.11f),
                        shape = RoundedCornerShape(6.dp)
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
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(
                        "${FormatUtils.formatSize(file.size)} · ${FormatUtils.formatDate(file.modified)}${if (file.pageCount > 1) " · ${file.pageCount}p" else ""}",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.muted,
                        maxLines = 1
                    )
                    matchedPages.take(4).forEach { pg ->
                        Surface(
                            color = palette.success.copy(alpha = 0.13f),
                            shape = RoundedCornerShape(5.dp)
                        ) {
                            Text(
                                "p.$pg",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.success,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                            )
                        }
                    }
                }
                if (previewSnippet.isNotBlank()) {
                    Spacer(Modifier.height(3.dp))
                    Text(
                        annotated,
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
