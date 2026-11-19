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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Label
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.data.db.BookmarkEntity
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.ui.components.DocumentPreviewDialog
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
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val allFiles by searchViewModel.allFiles.collectAsState()
    var editTagsFor by remember { mutableStateOf<BookmarkEntity?>(null) }
    var previewFile by remember { mutableStateOf<FileEntity?>(null) }

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
                Column {
                    Text("Bookmarks", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("${bookmarks.size} starred document(s)", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            if (bookmarks.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.Bookmark, contentDescription = null, tint = palette.dim, modifier = Modifier.size(50.dp))
                        Spacer(Modifier.height(8.dp))
                        Text("No Bookmarks Yet", style = MaterialTheme.typography.titleLarge, color = palette.text)
                        Text("Tap the bookmark icon inside any document preview to pin it here.", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(bookmarks, key = { it.id }) { bm ->
                        val tags = remember(bm.tagsJson) {
                            runCatching { Json.decodeFromString<List<String>>(bm.tagsJson) }.getOrDefault(emptyList())
                        }
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
                                    Icon(Icons.Rounded.Label, contentDescription = "Edit Tags", tint = palette.accent)
                                }
                                IconButton(onClick = { searchViewModel.removeBookmark(bm.fileUri) }) {
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
        val existingTags = runCatching { Json.decodeFromString<List<String>>(bm.tagsJson) }.getOrDefault(emptyList())
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
            onOpenWatermark = {},
            onOpenSignature = {},
            onOpenPageOrganizer = {
                previewFile = null
                onNavigate(PageOrganizerRoute(file.uri, file.name))
            }
        )
    }
}
