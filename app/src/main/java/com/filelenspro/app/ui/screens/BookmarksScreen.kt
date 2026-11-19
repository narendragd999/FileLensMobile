package com.filelenspro.app.ui.screens

import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.data.db.BookmarkEntity
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.ui.components.DocumentPreviewDialog
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.components.TagManagementDialog
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import kotlinx.serialization.json.Json

@Composable
fun BookmarksScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onNavigate: (Any) -> Unit,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val allFiles by searchViewModel.allFiles.collectAsState()
    val savedSignatures by toolsViewModel.savedSignatures.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    var selectedTag by remember { mutableStateOf<String?>(null) }
    var isGridView by remember { mutableStateOf(false) }
    var editTagsFor by remember { mutableStateOf<BookmarkEntity?>(null) }
    var previewFile by remember { mutableStateOf<FileEntity?>(null) }
    var watermarkFile by remember { mutableStateOf<FileEntity?>(null) }
    var signatureFile by remember { mutableStateOf<Pair<FileEntity, Int>?>(null) }

    val parsedTagsById = remember(bookmarks) {
        bookmarks.associate { bm ->
            bm.id to runCatching { Json.decodeFromString<List<String>>(bm.tagsJson) }.getOrDefault(emptyList())
        }
    }
    val allTags = remember(parsedTagsById) {
        parsedTagsById.values.flatten().filter { it.isNotBlank() }.distinct().sorted()
    }
    val filtered = remember(bookmarks, searchQuery, selectedTag, parsedTagsById) {
        bookmarks.filter { bm ->
            val tags = parsedTagsById[bm.id].orEmpty()
            val matchesTag = selectedTag == null || selectedTag in tags
            val matchesSearch = searchQuery.isBlank() ||
                bm.fileName.contains(searchQuery.trim(), ignoreCase = true) ||
                tags.any { it.contains(searchQuery.trim(), ignoreCase = true) }
            matchesTag && matchesSearch
        }
    }

    BackHandler(onBack = onBack)

    Column(
        modifier = Modifier.fillMaxSize().background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = palette.text)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Bookmarks", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("${filtered.size} starred document(s)", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
                IconButton(onClick = { isGridView = !isGridView }, modifier = Modifier.size(48.dp).testTag("bookmarks_view_toggle_btn")) {
                    Icon(
                        if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                        contentDescription = "Toggle Layout",
                        tint = palette.text
                    )
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            if (bookmarks.isNotEmpty()) {
                Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Search bookmarked documents…") },
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
                            modifier = Modifier.fillMaxWidth().testTag("bookmarks_search_input")
                        )
                        if (allTags.isNotEmpty()) {
                            Row(
                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                FilterChip(
                                    selected = selectedTag == null,
                                    onClick = { selectedTag = null },
                                    label = { Text("All (${bookmarks.size})") },
                                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                                )
                                allTags.forEach { tag ->
                                    FilterChip(
                                        selected = selectedTag == tag,
                                        onClick = { selectedTag = if (selectedTag == tag) null else tag },
                                        label = { Text(tag) },
                                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (filtered.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.Bookmark, contentDescription = null, tint = palette.dim, modifier = Modifier.size(50.dp))
                        Spacer(Modifier.height(8.dp))
                        Text(if (bookmarks.isEmpty()) "No Bookmarks Yet" else "No Matching Bookmarks", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Text("Tap the bookmark icon inside any document preview to pin it here.", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                    }
                }
            } else if (isGridView) {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(filtered, key = { it.id }) { bm ->
                        val tags = parsedTagsById[bm.id].orEmpty()
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                .clip(RoundedCornerShape(14.dp))
                                .clickable { previewFile = allFiles.firstOrNull { it.uri == bm.fileUri } }
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                    Icon(Icons.Rounded.Bookmark, contentDescription = null, tint = palette.warning)
                                    Row {
                                        IconButton(onClick = { editTagsFor = bm }, modifier = Modifier.size(34.dp)) {
                                            Icon(Icons.AutoMirrored.Rounded.Label, contentDescription = "Edit Tags", tint = palette.accent, modifier = Modifier.size(18.dp))
                                        }
                                        IconButton(
                                            onClick = {
                                                searchViewModel.removeBookmark(bm.fileUri)
                                                toolsViewModel.postToast("Removed bookmark", actionLabel = "Undo") {
                                                    searchViewModel.restoreBookmark(bm)
                                                }
                                            },
                                            modifier = Modifier.size(34.dp)
                                        ) {
                                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove", tint = palette.danger, modifier = Modifier.size(18.dp))
                                        }
                                    }
                                }
                                Text(bm.fileName, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${FormatUtils.formatSize(bm.size)} · ${tags.joinToString(", ").ifBlank { bm.extension.uppercase() }}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(filtered, key = { it.id }) { bm ->
                        val tags = parsedTagsById[bm.id].orEmpty()
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                .clip(RoundedCornerShape(14.dp))
                                .clickable {
                                    previewFile = allFiles.firstOrNull { it.uri == bm.fileUri }
                                }
                        ) {
                            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Bookmark, contentDescription = null, tint = palette.warning)
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(bm.fileName, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${FormatUtils.formatSize(bm.size)} · ${tags.joinToString(", ").ifBlank { bm.extension.uppercase() }}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.muted
                                    )
                                }
                                IconButton(onClick = { editTagsFor = bm }) {
                                    Icon(Icons.AutoMirrored.Rounded.Label, contentDescription = "Edit Tags", tint = palette.accent)
                                }
                                IconButton(
                                    onClick = {
                                        searchViewModel.removeBookmark(bm.fileUri)
                                        toolsViewModel.postToast("Removed bookmark", actionLabel = "Undo") {
                                            searchViewModel.restoreBookmark(bm)
                                        }
                                    }
                                ) {
                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove Bookmark", tint = palette.danger)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editTagsFor?.let { bm ->
        val existingTags = parsedTagsById[bm.id].orEmpty()
        TagManagementDialog(
            currentTag = existingTags.firstOrNull().orEmpty(),
            onDismiss = { editTagsFor = null },
            onSave = { tag ->
                searchViewModel.updateBookmarkTags(bm.fileUri, listOf(tag))
                editTagsFor = null
            }
        )
    }

    previewFile?.let { file ->
        DocumentPreviewDialog(
            file = file,
            searchQuery = "",
            isBookmarked = true,
            engine = toolsViewModel.engine,
            onDismiss = { previewFile = null },
            onToggleBookmark = { searchViewModel.toggleBookmark(file); previewFile = null },
            onRerunOcr = { toolsViewModel.rerunOcrForFile(file) },
            onPromoteToCard = { toolsViewModel.promoteFileToCard(file, file.customTag.ifBlank { "Document" }) },
            onOpenWatermark = { watermarkFile = file },
            onOpenSignature = { pageIdx -> signatureFile = file to pageIdx },
            onOpenPageOrganizer = {
                previewFile = null
                onNavigate(PageOrganizerRoute(file.uri, file.name))
            },
            onApplyFilterOrRotate = { filter, rot -> toolsViewModel.applyImageFilterOrRotate(file, filter, rot) },
            onShareMasked = { toolsViewModel.shareMaskedDocument(context, file) }
        )
    }

    watermarkFile?.let { f ->
        DocumentWatermarkDialog(
            onDismiss = { watermarkFile = null },
            onApply = { t, c, a ->
                toolsViewModel.applyImageWatermark(f, t, c, a)
                watermarkFile = null
            }
        )
    }

    signatureFile?.let { (f, pageIdx) ->
        DocumentSignatureDialog(
            onDismiss = { signatureFile = null },
            onApply = { bmp ->
                toolsViewModel.applyImageSignature(f, bmp, pageIdx)
                signatureFile = null
            },
            savedSignatures = savedSignatures,
            onSaveSignatureForReuse = { toolsViewModel.saveSignatureForReuse(it) },
            onDeleteSavedSignature = { toolsViewModel.deleteSavedSignature(it) },
            onApplyWithPlacement = { bmp, placement ->
                toolsViewModel.applyImageSignature(f, bmp, pageIdx, placement)
                signatureFile = null
            }
        )
    }
}
