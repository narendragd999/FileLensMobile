package com.filelenspro.app.ui.screens

import android.Manifest
import android.os.Build
import android.os.Environment
import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.DriveFileRenameOutline
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import com.filelenspro.app.data.model.StorageItem
import com.filelenspro.app.ui.components.AllFilesPermissionDialog
import com.filelenspro.app.ui.components.LanShareSheet
import com.filelenspro.app.ui.components.RichIndexingProgressBanner
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import com.filelenspro.app.util.StoragePermissionHelper
import java.io.File

@Composable
fun FileManagerScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current

    val currentPath by toolsViewModel.currentFolderPath.collectAsState()
    val items by toolsViewModel.folderItems.collectAsState()
    val clipboard by toolsViewModel.clipboardItems.collectAsState()
    val isHttpRunning by toolsViewModel.isHttpRunning.collectAsState()
    val httpUrl by toolsViewModel.httpServerUrl.collectAsState()
    val isFtpRunning by toolsViewModel.isFtpRunning.collectAsState()
    val ftpUrl by toolsViewModel.ftpServerUrl.collectAsState()

    val hasAllFiles by searchViewModel.hasAllFilesPermission.collectAsState()
    val isIndexing by searchViewModel.isIndexing.collectAsState()
    val indexProgress by searchViewModel.indexProgress.collectAsState()

    var isGridView by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var typeFilter by remember { mutableStateOf("all") } // all | folders | pdfs | images | docs
    var sortBy by remember { mutableStateOf("name") } // name | size | date
    var showSortMenu by remember { mutableStateOf(false) }
    var selectedPaths by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showNewFolderDialog by remember { mutableStateOf(false) }
    var showLanSheet by remember { mutableStateOf(false) }
    var showAllFilesDialog by remember { mutableStateOf(false) }
    var renameItem by remember { mutableStateOf<StorageItem?>(null) }
    var detailItem by remember { mutableStateOf<StorageItem?>(null) }

    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            toolsViewModel.importUrisToCurrentFolder(uris)
        }
    }
    val folderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { treeUri ->
        if (treeUri != null) {
            searchViewModel.addSafFolder(treeUri) { added ->
                toolsViewModel.postToast("Linked & indexed $added file(s)")
            }
        }
    }
    val legacyReadLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        searchViewModel.refreshStoragePermission()
        toolsViewModel.refreshFolderRoots()
        if (granted) {
            searchViewModel.indexEntireDevice(forceReindex = false) { s ->
                if (s != null) toolsViewModel.postToast("Indexed +${s.newOrUpdated} files (${s.skippedUnchanged} unchanged skipped)")
            }
        }
    }

    BackHandler {
        if (selectedPaths.isNotEmpty()) {
            selectedPaths = emptySet()
        } else if (currentPath != null) {
            toolsViewModel.navigateUpFolder()
        } else {
            onBack()
        }
    }

    val filteredItems = remember(items, searchQuery, typeFilter, sortBy) {
        val byType = when (typeFilter) {
            "folders" -> items.filter { it.isDirectory }
            "pdfs" -> items.filter { !it.isDirectory && it.extension.equals("pdf", true) }
            "images" -> items.filter { !it.isDirectory && it.extension.lowercase() in setOf("jpg", "jpeg", "png", "webp", "bmp", "gif") }
            "docs" -> items.filter { !it.isDirectory && it.extension.lowercase() in setOf("txt", "md", "csv", "json", "doc", "docx", "xls", "xlsx", "ppt", "pptx") }
            else -> items
        }
        val searched = if (searchQuery.isBlank()) byType else {
            val q = searchQuery.trim().lowercase()
            byType.filter { it.name.lowercase().contains(q) }
        }
        when (sortBy) {
            "size" -> searched.sortedWith(compareByDescending<StorageItem> { it.isDirectory }.thenByDescending { it.size })
            "date" -> searched.sortedWith(compareByDescending<StorageItem> { it.isDirectory }.thenByDescending { it.modifiedMs })
            else -> searched.sortedWith(compareByDescending<StorageItem> { it.isDirectory }.thenBy { it.name.lowercase() })
        }
    }

    val selectedItems = remember(items, selectedPaths) { items.filter { it.path in selectedPaths } }

    // Breadcrumb segments supporting both App Vault and External Device Storage (/storage/emulated/0)
    val breadcrumbs = remember(currentPath) {
        val appRoot = context.filesDir.absolutePath
        val extRoot = Environment.getExternalStorageDirectory().absolutePath
        when {
            currentPath == null -> emptyList()
            currentPath!!.startsWith(appRoot) -> {
                val rel = currentPath!!.removePrefix(appRoot).trimStart('/')
                var accum = appRoot
                rel.split('/').filter { it.isNotBlank() }.map { seg ->
                    accum = "$accum/$seg"
                    seg to accum
                }
            }
            currentPath == extRoot -> listOf("Device" to extRoot)
            currentPath!!.startsWith("$extRoot/") -> {
                val rel = currentPath!!.removePrefix(extRoot).trimStart('/')
                var accum = extRoot
                listOf("Device" to extRoot) + rel.split('/').filter { it.isNotBlank() }.map { seg ->
                    accum = "$accum/$seg"
                    seg to accum
                }
            }
            else -> listOf(File(currentPath!!).name to currentPath!!)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(color = palette.surface, tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        if (currentPath != null) toolsViewModel.navigateUpFolder() else onBack()
                    },
                    modifier = Modifier.size(48.dp).testTag("fm_back_btn")
                ) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = palette.text)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("File Manager", style = MaterialTheme.typography.titleLarge, color = palette.text, fontWeight = FontWeight.Bold)
                    Text(
                        "${filteredItems.size} item(s) · ${if (hasAllFiles) "Full Device Access" else "App Vault"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(
                    onClick = { importPicker.launch(arrayOf("*/*")) },
                    modifier = Modifier.size(44.dp).testTag("fm_import_btn")
                ) {
                    Icon(Icons.Rounded.UploadFile, contentDescription = "Import Files Here", tint = palette.accent)
                }
                Box {
                    IconButton(onClick = { showSortMenu = true }, modifier = Modifier.size(44.dp)) {
                        Icon(Icons.AutoMirrored.Rounded.Sort, contentDescription = "Sort", tint = palette.text)
                    }
                    DropdownMenu(expanded = showSortMenu, onDismissRequest = { showSortMenu = false }) {
                        listOf("name" to "Name (A-Z)", "size" to "Largest Size", "date" to "Recently Modified").forEach { (id, label) ->
                            DropdownMenuItem(
                                text = { Text(if (sortBy == id) "✓ $label" else label) },
                                onClick = { sortBy = id; showSortMenu = false }
                            )
                        }
                    }
                }
                IconButton(onClick = { isGridView = !isGridView }, modifier = Modifier.size(44.dp)) {
                    Icon(
                        if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                        contentDescription = "Toggle Layout",
                        tint = palette.text
                    )
                }
                IconButton(onClick = { showNewFolderDialog = true }, modifier = Modifier.size(44.dp).testTag("fm_new_folder_btn")) {
                    Icon(Icons.Rounded.CreateNewFolder, contentDescription = "New Folder", tint = palette.accent)
                }
                IconButton(
                    onClick = {
                        val toShare = if (selectedItems.isNotEmpty()) selectedItems.filter { !it.isDirectory }
                        else items.filter { !it.isDirectory }
                        toolsViewModel.startLanShare(toShare)
                        showLanSheet = true
                    },
                    modifier = Modifier.size(44.dp).testTag("fm_lan_btn")
                ) {
                    Icon(Icons.Rounded.Wifi, contentDescription = "LAN Explorer Share", tint = palette.success)
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            // Breadcrumb & Filter Bar
            Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "Storage",
                            style = MaterialTheme.typography.labelLarge,
                            color = if (currentPath == null) palette.text else palette.accent,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .clickable { toolsViewModel.openFolder(null) }
                                .padding(horizontal = 6.dp, vertical = 4.dp)
                        )
                        breadcrumbs.forEach { (seg, fullPath) ->
                            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = null, tint = palette.dim, modifier = Modifier.size(16.dp))
                            Text(
                                seg,
                                style = MaterialTheme.typography.labelLarge,
                                color = if (fullPath == currentPath) palette.text else palette.accent,
                                fontWeight = if (fullPath == currentPath) FontWeight.Bold else FontWeight.Medium,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable { toolsViewModel.openFolder(fullPath) }
                                    .padding(horizontal = 6.dp, vertical = 4.dp)
                            )
                        }
                    }

                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Search files in this folder…") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                        trailingIcon = {
                            if (searchQuery.isNotBlank()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Clear")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().testTag("fm_search_input")
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf("all" to "All", "folders" to "Folders", "pdfs" to "PDFs", "images" to "Images", "docs" to "Docs").forEach { (id, label) ->
                            FilterChip(
                                selected = typeFilter == id,
                                onClick = { typeFilter = id },
                                label = { Text(label) },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                            )
                        }
                    }
                }
            }

            // Live Indexing Progress Banner
            RichIndexingProgressBanner(
                isIndexing = isIndexing,
                progress = indexProgress,
                onCancel = { searchViewModel.cancelIndexing() },
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
            )

            // Root-level All Files Access / Entire Device Index Action Card
            if (currentPath == null && !isIndexing) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    val bannerBrush = if (hasAllFiles) {
                        Brush.horizontalGradient(listOf(palette.emeraldGradientStart, palette.emeraldGradientEnd))
                    } else {
                        Brush.horizontalGradient(listOf(palette.accentGradientStart, palette.accentGradientEnd))
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(bannerBrush)
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            if (hasAllFiles) Icons.Rounded.Storage else Icons.Rounded.LockOpen,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (hasAllFiles) "Full Device Storage Ready" else "Unlock Internal Storage",
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                if (hasAllFiles) "Browse & incrementally index all files at once" else "Grant All Files Access to browse & index entire phone",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.85f)
                            )
                        }
                        Button(
                            onClick = {
                                if (hasAllFiles) {
                                    searchViewModel.indexEntireDevice(forceReindex = false) { s ->
                                        if (s != null) toolsViewModel.postToast("Indexed +${s.newOrUpdated} files (${s.skippedUnchanged} unchanged skipped)")
                                    }
                                } else {
                                    showAllFilesDialog = true
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White,
                                contentColor = if (hasAllFiles) palette.emeraldGradientStart else palette.accentGradientStart
                            ),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            modifier = Modifier.testTag("fm_index_device_btn")
                        ) {
                            Text(if (hasAllFiles) "Index All" else "Allow", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Selection / Clipboard Action Bar
            if (selectedPaths.isNotEmpty() || clipboard.isNotEmpty()) {
                Surface(color = palette.accent.copy(alpha = 0.1f), modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            if (selectedPaths.isNotEmpty()) "${selectedPaths.size} selected" else "${clipboard.size} in clipboard",
                            style = MaterialTheme.typography.labelLarge,
                            color = palette.accent,
                            modifier = Modifier.weight(1f)
                        )
                        if (selectedItems.isNotEmpty()) {
                            IconButton(onClick = { toolsViewModel.stageClipboard(selectedItems, false); selectedPaths = emptySet() }) {
                                Icon(Icons.Rounded.ContentCopy, contentDescription = "Copy", tint = palette.text)
                            }
                            IconButton(onClick = { toolsViewModel.stageClipboard(selectedItems, true); selectedPaths = emptySet() }) {
                                Icon(Icons.Rounded.ContentCut, contentDescription = "Move", tint = palette.text)
                            }
                            IconButton(onClick = {
                                selectedItems.firstOrNull { !it.isDirectory }?.let {
                                    FormatUtils.shareFileOrText(context, it.path, it.name, it.name)
                                }
                            }) {
                                Icon(Icons.Rounded.Share, contentDescription = "Share", tint = palette.text)
                            }
                            IconButton(onClick = {
                                toolsViewModel.deleteStorageItems(selectedItems)
                                selectedPaths = emptySet()
                            }) {
                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete", tint = palette.danger)
                            }
                        }
                        if (clipboard.isNotEmpty() && currentPath != null) {
                            IconButton(onClick = { toolsViewModel.pasteClipboardHere() }) {
                                Icon(Icons.Rounded.ContentPaste, contentDescription = "Paste Here", tint = palette.success)
                            }
                        }
                    }
                }
            }

            if (filteredItems.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(
                        if (items.isEmpty()) "This folder is empty. Tap the upload icon to import files." else "No matching files in this folder.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.muted
                    )
                }
            } else if (isGridView) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(148.dp),
                    contentPadding = PaddingValues(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filteredItems, key = { it.id }) { item ->
                        val isSel = item.path in selectedPaths
                        StorageItemCard(
                            item = item,
                            isSelected = isSel,
                            onClick = {
                                if (selectedPaths.isNotEmpty()) {
                                    selectedPaths = if (isSel) selectedPaths - item.path else selectedPaths + item.path
                                } else if (item.isDirectory) {
                                    toolsViewModel.openFolder(item.path)
                                } else {
                                    FormatUtils.openInExternalViewer(context, item.path, item.extension)
                                }
                            },
                            onToggleSelect = { selectedPaths = if (isSel) selectedPaths - item.path else selectedPaths + item.path },
                            onRename = { renameItem = item },
                            onIndex = { toolsViewModel.indexStorageItem(item) },
                            onShare = { FormatUtils.shareFileOrText(context, item.path, item.name, item.name) },
                            onDetails = { detailItem = item },
                            onDelete = { toolsViewModel.deleteStorageItems(listOf(item)) }
                        )
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(filteredItems, key = { it.id }) { item ->
                        val isSel = item.path in selectedPaths
                        StorageItemCard(
                            item = item,
                            isSelected = isSel,
                            onClick = {
                                if (selectedPaths.isNotEmpty()) {
                                    selectedPaths = if (isSel) selectedPaths - item.path else selectedPaths + item.path
                                } else if (item.isDirectory) {
                                    toolsViewModel.openFolder(item.path)
                                } else {
                                    FormatUtils.openInExternalViewer(context, item.path, item.extension)
                                }
                            },
                            onToggleSelect = { selectedPaths = if (isSel) selectedPaths - item.path else selectedPaths + item.path },
                            onRename = { renameItem = item },
                            onIndex = { toolsViewModel.indexStorageItem(item) },
                            onShare = { FormatUtils.shareFileOrText(context, item.path, item.name, item.name) },
                            onDetails = { detailItem = item },
                            onDelete = { toolsViewModel.deleteStorageItems(listOf(item)) }
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
                    StoragePermissionHelper.launchAllFilesAccessSettings(context)
                } else {
                    legacyReadLauncher.launch(Manifest.permission.READ_EXTERNAL_STORAGE)
                }
            },
            onUseFolderPicker = {
                showAllFilesDialog = false
                folderPicker.launch(null)
            },
            onDismiss = { showAllFilesDialog = false }
        )
    }

    if (showNewFolderDialog) {
        var folderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showNewFolderDialog = false },
            containerColor = palette.surface,
            title = { Text("Create Folder", color = palette.text) },
            text = {
                OutlinedTextField(
                    value = folderName,
                    onValueChange = { folderName = it },
                    label = { Text("Folder Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (folderName.isNotBlank()) toolsViewModel.createFolder(folderName)
                    showNewFolderDialog = false
                }) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showNewFolderDialog = false }) { Text("Cancel") } }
        )
    }

    renameItem?.let { target ->
        var newName by remember { mutableStateOf(if (target.isDirectory) target.name else target.name.substringBeforeLast('.')) }
        AlertDialog(
            onDismissRequest = { renameItem = null },
            containerColor = palette.surface,
            title = { Text("Rename Item", color = palette.text) },
            text = {
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    label = { Text("New Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    toolsViewModel.renameStorageItem(target, newName)
                    renameItem = null
                }) { Text("Rename") }
            },
            dismissButton = { TextButton(onClick = { renameItem = null }) { Text("Cancel") } }
        )
    }

    detailItem?.let { target ->
        AlertDialog(
            onDismissRequest = { detailItem = null },
            containerColor = palette.surface,
            title = { Text(target.name, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Type: ${if (target.isDirectory) "Folder" else target.extension.uppercase().ifBlank { "File" }}", color = palette.text)
                    if (!target.isDirectory) {
                        Text("Size: ${FormatUtils.formatSize(target.size)}", color = palette.text)
                    } else {
                        val children = File(target.path).listFiles()?.size ?: 0
                        Text("Contains: $children item(s)", color = palette.text)
                    }
                    Text("Modified: ${FormatUtils.formatMillis(target.modifiedMs)}", color = palette.muted)
                    Text("Path: ${target.path}", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                }
            },
            confirmButton = { TextButton(onClick = { detailItem = null }) { Text("Close") } }
        )
    }

    if (showLanSheet) {
        LanShareSheet(
            isHttpRunning = isHttpRunning,
            httpUrl = httpUrl,
            isFtpRunning = isFtpRunning,
            ftpUrl = ftpUrl,
            sharedCount = if (selectedItems.isNotEmpty()) selectedItems.count { !it.isDirectory } else items.count { !it.isDirectory },
            onToggleHttp = {
                if (isHttpRunning) toolsViewModel.stopLanShare()
                else toolsViewModel.startLanShare(items.filter { !it.isDirectory })
            },
            onToggleFtp = { toolsViewModel.toggleFtpServer() },
            onDismiss = { showLanSheet = false }
        )
    }
}

@Composable
private fun StorageItemCard(
    item: StorageItem,
    isSelected: Boolean,
    onClick: () -> Unit,
    onToggleSelect: () -> Unit,
    onRename: () -> Unit,
    onIndex: () -> Unit,
    onShare: () -> Unit,
    onDetails: () -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalFileLensColors.current
    var showMenu by remember { mutableStateOf(false) }

    val (icon, tint) = when {
        item.id.startsWith("device_") -> Icons.Rounded.PhoneAndroid to palette.accent
        item.isDirectory -> Icons.Rounded.Folder to palette.warning
        item.extension.equals("pdf", true) -> Icons.Rounded.PictureAsPdf to palette.danger
        item.extension.lowercase() in setOf("jpg", "jpeg", "png", "webp", "bmp", "gif") -> Icons.Rounded.Image to palette.success
        else -> Icons.Rounded.Description to palette.accent
    }

    Surface(
        color = if (isSelected) palette.accent.copy(alpha = 0.12f) else palette.surface,
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, if (isSelected) palette.accent else palette.border, RoundedCornerShape(14.dp))
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
    ) {
        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(tint.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = item.name, tint = tint, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    when {
                        item.id.startsWith("device_") -> "Device Storage"
                        item.isDirectory && item.size > 0 -> "Vault Folder · ${FormatUtils.formatSize(item.size)}"
                        item.isDirectory -> "Folder"
                        else -> "${FormatUtils.formatSize(item.size)} · ${FormatUtils.formatMillis(item.modifiedMs)}"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.muted
                )
            }
            IconButton(onClick = onToggleSelect, modifier = Modifier.size(38.dp)) {
                Icon(
                    Icons.Rounded.CheckCircle,
                    contentDescription = "Select Item",
                    tint = if (isSelected) palette.accent else palette.dim.copy(alpha = 0.4f)
                )
            }
            Box {
                IconButton(onClick = { showMenu = true }, modifier = Modifier.size(38.dp)) {
                    Icon(Icons.Rounded.MoreVert, contentDescription = "Item Actions", tint = palette.muted)
                }
                DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                    if (!item.isDirectory) {
                        DropdownMenuItem(
                            text = { Text("Index into Search") },
                            leadingIcon = { Icon(Icons.Rounded.Sync, contentDescription = null) },
                            onClick = { showMenu = false; onIndex() }
                        )
                        DropdownMenuItem(
                            text = { Text("Share") },
                            leadingIcon = { Icon(Icons.Rounded.Share, contentDescription = null) },
                            onClick = { showMenu = false; onShare() }
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Rename") },
                        leadingIcon = { Icon(Icons.Rounded.DriveFileRenameOutline, contentDescription = null) },
                        onClick = { showMenu = false; onRename() }
                    )
                    DropdownMenuItem(
                        text = { Text("Details") },
                        leadingIcon = { Icon(Icons.Rounded.Info, contentDescription = null) },
                        onClick = { showMenu = false; onDetails() }
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
