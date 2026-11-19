package com.filelenspro.app.ui.screens

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.data.model.StorageItem
import com.filelenspro.app.ui.components.LanShareSheet
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@Composable
fun FileManagerScreen(
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

    var isGridView by remember { mutableStateOf(false) }
    var selectedPaths by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showNewFolderDialog by remember { mutableStateOf(false) }
    var showLanSheet by remember { mutableStateOf(false) }

    BackHandler {
        if (selectedPaths.isNotEmpty()) {
            selectedPaths = emptySet()
        } else if (currentPath != null) {
            toolsViewModel.navigateUpFolder()
        } else {
            onBack()
        }
    }

    val selectedItems = remember(items, selectedPaths) { items.filter { it.path in selectedPaths } }

    Column(
        modifier = Modifier.fillMaxSize().background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
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
                    Text("File Manager", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text(
                        currentPath?.substringAfterLast('/') ?: "App Vault Roots",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = { isGridView = !isGridView }, modifier = Modifier.size(48.dp)) {
                    Icon(
                        if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                        contentDescription = "Toggle Layout",
                        tint = palette.text
                    )
                }
                IconButton(onClick = { showNewFolderDialog = true }, modifier = Modifier.size(48.dp).testTag("fm_new_folder_btn")) {
                    Icon(Icons.Rounded.CreateNewFolder, contentDescription = "New Folder", tint = palette.accent)
                }
                IconButton(
                    onClick = {
                        val toShare = if (selectedItems.isNotEmpty()) selectedItems.filter { !it.isDirectory }
                        else items.filter { !it.isDirectory }
                        toolsViewModel.startLanShare(toShare)
                        showLanSheet = true
                    },
                    modifier = Modifier.size(48.dp).testTag("fm_lan_btn")
                ) {
                    Icon(Icons.Rounded.Wifi, contentDescription = "LAN Explorer Share", tint = palette.success)
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
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

            if (items.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("This folder is empty", style = MaterialTheme.typography.bodyLarge, color = palette.muted)
                }
            } else if (isGridView) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(148.dp),
                    contentPadding = PaddingValues(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(items, key = { it.id }) { item ->
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
                            onToggleSelect = {
                                selectedPaths = if (isSel) selectedPaths - item.path else selectedPaths + item.path
                            }
                        )
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(items, key = { it.id }) { item ->
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
                            onToggleSelect = {
                                selectedPaths = if (isSel) selectedPaths - item.path else selectedPaths + item.path
                            }
                        )
                    }
                }
            }
        }
    }

    if (showNewFolderDialog) {
        var folderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showNewFolderDialog = false },
            containerColor = palette.surface,
            title = { Text("Create Vault Folder", color = palette.text) },
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
    onToggleSelect: () -> Unit
) {
    val palette = LocalFileLensColors.current
    Surface(
        color = if (isSelected) palette.accent.copy(alpha = 0.12f) else palette.surface,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, if (isSelected) palette.accent else palette.border, RoundedCornerShape(14.dp))
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (item.isDirectory) Icons.Rounded.Folder else Icons.Rounded.Description,
                contentDescription = item.name,
                tint = if (item.isDirectory) palette.warning else palette.accent,
                modifier = Modifier.size(30.dp)
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    if (item.isDirectory) "Folder" else "${FormatUtils.formatSize(item.size)} · ${FormatUtils.formatMillis(item.modifiedMs)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.muted
                )
            }
            IconButton(onClick = onToggleSelect, modifier = Modifier.size(40.dp)) {
                Icon(
                    Icons.Rounded.CheckCircle,
                    contentDescription = "Select Item",
                    tint = if (isSelected) palette.accent else palette.dim.copy(alpha = 0.4f)
                )
            }
        }
    }
}
