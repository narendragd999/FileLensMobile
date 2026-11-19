package com.filelenspro.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.ui.components.DocumentPreviewDialog
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.components.FileLensTopBar
import com.filelenspro.app.ui.components.FileThumbnail
import com.filelenspro.app.ui.components.TagManagementDialog
import com.filelenspro.app.ui.navigation.CreateCardRoute
import com.filelenspro.app.ui.navigation.DocScannerRoute
import com.filelenspro.app.ui.navigation.PageOrganizerRoute
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.SearchViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardsScreen(
    searchViewModel: SearchViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val cards by toolsViewModel.cards.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val bookmarkedUris = remember(bookmarks) { bookmarks.map { it.fileUri }.toSet() }

    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var isGridView by remember { mutableStateOf(false) }
    var showAddSheet by remember { mutableStateOf(false) }
    var previewCard by remember { mutableStateOf<FileEntity?>(null) }
    var editTagFor by remember { mutableStateOf<FileEntity?>(null) }
    var detailCard by remember { mutableStateOf<FileEntity?>(null) }
    var watermarkCard by remember { mutableStateOf<FileEntity?>(null) }
    var signatureCard by remember { mutableStateOf<FileEntity?>(null) }

    val photoCardPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            onNavigate(CreateCardRoute(fileUri = uri.toString(), fileName = "Photo Card"))
        }
    }
    val docCardPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            onNavigate(CreateCardRoute(fileUri = uri.toString(), fileName = "Document Card"))
        }
    }

    val expiryAlerts = remember(cards) {
        cards.mapNotNull { c ->
            SmartTaxonomy.detectCardExpiryAlert(c)?.let { alert -> c to alert }
        }
    }

    val categoryCounts = remember(cards) {
        SmartTaxonomy.SMART_CATEGORIES.associate { cat ->
            cat.id to cards.count { SmartTaxonomy.getCardSmartCategory(it.name, it.customTag, it.ocrText) == cat.id }
        }
    }

    val filteredCards = remember(cards, selectedCategory) {
        if (selectedCategory == null) cards
        else cards.filter { SmartTaxonomy.getCardSmartCategory(it.name, it.customTag, it.ocrText) == selectedCategory }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            FileLensTopBar(
                title = "Smart Cards",
                subtitle = "${cards.size} digital cards · Auto-categorized",
                onOpenQuickNav = onOpenQuickNav,
                actions = {
                    IconButton(
                        onClick = { isGridView = !isGridView },
                        modifier = Modifier.size(48.dp).testTag("cards_view_toggle_btn")
                    ) {
                        Icon(
                            if (isGridView) Icons.AutoMirrored.Rounded.ViewList else Icons.Rounded.GridView,
                            contentDescription = "Toggle View",
                            tint = palette.text
                        )
                    }
                    IconButton(
                        onClick = { showAddSheet = true },
                        modifier = Modifier.size(48.dp).testTag("cards_add_btn")
                    ) {
                        Icon(Icons.Rounded.Add, contentDescription = "Add Smart Card", tint = palette.accent)
                    }
                }
            )

            LazyColumn(
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (expiryAlerts.isNotEmpty()) {
                    item {
                        Surface(
                            color = palette.warning.copy(alpha = 0.14f),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().border(1.dp, palette.warning.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.WarningAmber, contentDescription = null, tint = palette.warning, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Expiry Alerts (${expiryAlerts.size})", style = MaterialTheme.typography.titleMedium, color = palette.warning)
                                }
                                expiryAlerts.take(3).forEach { (card, msg) ->
                                    Text(
                                        "• ${card.name}: $msg",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = palette.text,
                                        modifier = Modifier.clickable { previewCard = card }
                                    )
                                }
                            }
                        }
                    }
                }

                // Smart Folders 6-category strip
                item {
                    Text("Smart Folders", style = MaterialTheme.typography.titleMedium, color = palette.text)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = selectedCategory == null,
                            onClick = { selectedCategory = null },
                            label = { Text("All (${cards.size})") },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                        )
                        SmartTaxonomy.SMART_CATEGORIES.forEach { cat ->
                            val count = categoryCounts[cat.id] ?: 0
                            FilterChip(
                                selected = selectedCategory == cat.id,
                                onClick = { selectedCategory = if (selectedCategory == cat.id) null else cat.id },
                                label = { Text("${cat.label.substringBefore(" &")} ($count)") },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                            )
                        }
                    }
                }

                if (filteredCards.isEmpty()) {
                    item {
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(18.dp),
                            modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(18.dp))
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(Icons.Rounded.CreditCard, contentDescription = null, tint = palette.dim, modifier = Modifier.size(48.dp))
                                Spacer(Modifier.height(8.dp))
                                Text("No Smart Cards Here", style = MaterialTheme.typography.titleLarge, color = palette.text)
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Scan 2-in-1 A4 ID cards (Front + Back), receipts, bills, or medical prescriptions.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = palette.muted
                                )
                                Spacer(Modifier.height(12.dp))
                                Button(onClick = { showAddSheet = true }) { Text("+ Add First Card") }
                            }
                        }
                    }
                } else if (isGridView) {
                    item {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.height(((filteredCards.size + 1) / 2 * 185).coerceIn(200, 900).dp)
                        ) {
                            items(filteredCards, key = { it.id }) { card ->
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(16.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                        .clip(RoundedCornerShape(16.dp))
                                        .clickable { detailCard = card }
                                ) {
                                    Column(modifier = Modifier.padding(10.dp)) {
                                        FileThumbnail(file = card, engine = toolsViewModel.engine, modifier = Modifier.fillMaxWidth().height(100.dp))
                                        Spacer(Modifier.height(6.dp))
                                        Text(card.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(card.customTag.ifBlank { "Card" }, style = MaterialTheme.typography.labelSmall, color = palette.accent)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    items(filteredCards, key = { it.id }) { card ->
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                .clip(RoundedCornerShape(16.dp))
                                .clickable { detailCard = card }
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                FileThumbnail(file = card, engine = toolsViewModel.engine, modifier = Modifier.size(56.dp))
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(card.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Spacer(Modifier.height(3.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Surface(color = palette.accent.copy(alpha = 0.12f), shape = RoundedCornerShape(6.dp)) {
                                            Text(
                                                card.customTag.ifBlank { "Document" },
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.accent,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                        Text(FormatUtils.formatSize(card.size), style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                    }
                                }
                                IconButton(onClick = { editTagFor = card }, modifier = Modifier.size(44.dp)) {
                                    Icon(Icons.Rounded.Edit, contentDescription = "Edit Card Tag", tint = palette.muted)
                                }
                                IconButton(onClick = { toolsViewModel.deleteIndexedFile(card, true) }, modifier = Modifier.size(44.dp)) {
                                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete Card", tint = palette.danger)
                                }
                            }
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { showAddSheet = true },
            containerColor = palette.accent,
            contentColor = Color.White,
            modifier = Modifier.align(Alignment.BottomEnd).padding(18.dp).testTag("cards_fab_add")
        ) {
            Icon(Icons.Rounded.Add, contentDescription = "Add Smart Card")
        }
    }

    if (showAddSheet) {
        ModalBottomSheet(onDismissRequest = { showAddSheet = false }, containerColor = palette.surface) {
            Column(modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Add to Smart Cards", style = MaterialTheme.typography.titleLarge, color = palette.text)
                listOf(
                    Triple("Scan 2-in-1 A4 ID Card", "Front + Back composited onto 1 A4 PDF", Icons.Rounded.Badge) to {
                        showAddSheet = false; onNavigate(DocScannerRoute("idcard"))
                    },
                    Triple("Pick Photo from Gallery", "Aadhaar, PAN, receipt or prescription photo", Icons.Rounded.PhotoLibrary) to {
                        showAddSheet = false; photoCardPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    },
                    Triple("Import PDF / Document", "Tag & index an existing PDF card", Icons.Rounded.UploadFile) to {
                        showAddSheet = false; docCardPicker.launch(arrayOf("application/pdf", "image/*"))
                    }
                ).forEach { (meta, action) ->
                    Surface(
                        color = palette.surface2,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { action() }
                    ) {
                        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(meta.third, contentDescription = null, tint = palette.accent, modifier = Modifier.size(26.dp))
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(meta.first, style = MaterialTheme.typography.titleMedium, color = palette.text)
                                Text(meta.second, style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                            }
                        }
                    }
                }
            }
        }
    }

    detailCard?.let { card ->
        val related = remember(card, cards) { SmartTaxonomy.findRelatedCards(card, cards) }
        AlertDialog(
            onDismissRequest = { detailCard = null },
            containerColor = palette.surface,
            title = { Text(card.name, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    FileThumbnail(file = card, engine = toolsViewModel.engine, modifier = Modifier.fillMaxWidth().height(150.dp))
                    Text("Tag: ${card.customTag.ifBlank { "Document" }} · ${FormatUtils.formatSize(card.size)}", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                    if (related.isNotEmpty()) {
                        Text("Related Cards (On-Device AI)", style = MaterialTheme.typography.labelLarge, color = palette.accent)
                        related.forEach { rel ->
                            Surface(
                                color = palette.surface2,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth().clickable {
                                    detailCard = cards.firstOrNull { it.id == rel.cardId }
                                }
                            ) {
                                Text(
                                    "${rel.name} (${(rel.similarity * 100).toInt()}% match)",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = palette.text,
                                    modifier = Modifier.padding(8.dp)
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = { previewCard = card; detailCard = null }) { Text("Open Full Preview") }
            },
            dismissButton = {
                TextButton(onClick = { detailCard = null }) { Text("Close") }
            }
        )
    }

    editTagFor?.let { card ->
        TagManagementDialog(
            currentTag = card.customTag,
            onDismiss = { editTagFor = null },
            onSave = { tag ->
                toolsViewModel.updateCardTag(card.id, tag)
                editTagFor = null
            }
        )
    }

    previewCard?.let { file ->
        DocumentPreviewDialog(
            file = file,
            searchQuery = "",
            isBookmarked = file.uri in bookmarkedUris,
            engine = toolsViewModel.engine,
            onDismiss = { previewCard = null },
            onToggleBookmark = { searchViewModel.toggleBookmark(file) },
            onRerunOcr = { toolsViewModel.rerunOcrForFile(file) },
            onPromoteToCard = {},
            onOpenWatermark = { watermarkCard = file },
            onOpenSignature = { signatureCard = file },
            onOpenPageOrganizer = {
                previewCard = null
                onNavigate(PageOrganizerRoute(file.uri, file.name))
            }
        )
    }

    watermarkCard?.let { c ->
        DocumentWatermarkDialog(onDismiss = { watermarkCard = null }, onApply = { t, col, a ->
            toolsViewModel.applyImageWatermark(c, t, col, a)
            watermarkCard = null
        })
    }
    signatureCard?.let { c ->
        DocumentSignatureDialog(onDismiss = { signatureCard = null }, onApply = { bmp ->
            toolsViewModel.applyImageSignature(c, bmp)
            signatureCard = null
        })
    }
}
