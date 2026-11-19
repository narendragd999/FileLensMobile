package com.filelenspro.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.automirrored.rounded.ViewList
import androidx.compose.material.icons.rounded.AccountBalance
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DirectionsCar
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.FolderShared
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.LocalHospital
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.PrivacyTip
import androidx.compose.material.icons.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.ExpiryUrgency
import com.filelenspro.app.domain.engine.ExpiryRadarEngine
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.ui.components.BiometricLockOverlay
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
import com.filelenspro.app.ui.viewmodel.SecondBrainViewModel
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardsScreen(
    searchViewModel: SearchViewModel,
    brainViewModel: SecondBrainViewModel,
    toolsViewModel: ToolsViewModel,
    onOpenQuickNav: () -> Unit,
    onNavigate: (Any) -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val cards by toolsViewModel.cards.collectAsState()
    val allFiles by toolsViewModel.allFiles.collectAsState()
    val bookmarks by searchViewModel.bookmarks.collectAsState()
    val userPrefs by toolsViewModel.userPrefs.collectAsState()
    val savedSignatures by toolsViewModel.savedSignatures.collectAsState()
    val bookmarkedUris = remember(bookmarks) { bookmarks.map { it.fileUri }.toSet() }

    var isVaultUnlocked by remember { mutableStateOf(false) }

    if (userPrefs.biometricCardsLock && !isVaultUnlocked) {
        BiometricLockOverlay(
            title = "Smart Cards Vault Locked",
            subtitle = "Authenticate with fingerprint, face, or device PIN to view IDs & cards",
            onUnlocked = { isVaultUnlocked = true }
        )
        return
    }

    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var isGridView by remember { mutableStateOf(false) }
    var showAddSheet by remember { mutableStateOf(false) }
    var showPickIndexedDialog by remember { mutableStateOf(false) }
    var previewCard by remember { mutableStateOf<FileEntity?>(null) }
    var editTagFor by remember { mutableStateOf<FileEntity?>(null) }
    var detailCard by remember { mutableStateOf<FileEntity?>(null) }
    var watermarkCard by remember { mutableStateOf<FileEntity?>(null) }
    var signatureCard by remember { mutableStateOf<Pair<FileEntity, Int>?>(null) }

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

    val radarItems = remember(allFiles) {
        ExpiryRadarEngine.scan(allFiles)
    }
    val urgentRadarCount = remember(radarItems) {
        radarItems.count { it.urgency != ExpiryUrgency.SAFE }
    }

    val categoryCounts = remember(cards) {
        SmartTaxonomy.SMART_CATEGORIES.associate { cat ->
            cat.id to cards.count { SmartTaxonomy.getCardSmartCategory(it.name, it.customTag, it.ocrText) == cat.id }
        }
    }

    val filteredCards = remember(cards, selectedCategory, searchQuery) {
        val byCat = if (selectedCategory == null) cards
        else cards.filter { SmartTaxonomy.getCardSmartCategory(it.name, it.customTag, it.ocrText) == selectedCategory }
        if (searchQuery.isBlank()) byCat else {
            val q = searchQuery.trim().lowercase()
            byCat.filter {
                it.name.lowercase().contains(q) ||
                    it.customTag.lowercase().contains(q) ||
                    (it.ocrText?.lowercase()?.contains(q) == true)
            }
        }
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
                    if (userPrefs.biometricCardsLock) {
                        IconButton(
                            onClick = { isVaultUnlocked = false },
                            modifier = Modifier.size(48.dp).testTag("cards_relock_btn")
                        ) {
                            Icon(Icons.Rounded.Lock, contentDescription = "Lock Vault", tint = palette.warning)
                        }
                    }
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
                item {
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        shadowElevation = 3.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Brush.horizontalGradient(listOf(palette.emeraldGradientStart, palette.emeraldGradientEnd)))
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Smart ID & Cards Wallet", style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold)
                                Text(
                                    "${cards.size} cards · $urgentRadarCount expiry radar alert(s) · 100% offline",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.White.copy(alpha = 0.88f)
                                )
                            }
                            Surface(
                                color = Color.White.copy(alpha = 0.2f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { onNavigate(DocScannerRoute("idcard")) }
                            ) {
                                Text(
                                    "2-in-1 ID",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                                )
                            }
                        }
                    }
                }

                item {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Search IDs, bills, tags, or OCR text…") },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                        trailingIcon = {
                            if (searchQuery.isNotBlank()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Clear Search")
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().testTag("cards_search_input")
                    )
                }

                if (radarItems.isNotEmpty()) {
                    item {
                        Surface(
                            color = palette.warning.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.warning.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                                .testTag("expiry_radar_card")
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.WarningAmber, contentDescription = null, tint = palette.warning, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        "Expiry & Renewal Radar (${radarItems.size})",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.text,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                radarItems.take(4).forEach { radar ->
                                    val badgeColor = when (radar.urgency) {
                                        ExpiryUrgency.EXPIRED -> palette.danger
                                        ExpiryUrgency.CRITICAL -> palette.warning
                                        ExpiryUrgency.UPCOMING -> palette.accent
                                        ExpiryUrgency.SAFE -> palette.success
                                    }
                                    val badgeLabel = when {
                                        radar.daysRemaining < 0 -> "EXPIRED"
                                        radar.daysRemaining == 0L -> "TODAY"
                                        else -> "${radar.daysRemaining}d left"
                                    }
                                    Surface(
                                        color = palette.surface,
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .border(1.dp, badgeColor.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                                            .clip(RoundedCornerShape(12.dp))
                                            .clickable { previewCard = radar.file }
                                    ) {
                                        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Surface(color = badgeColor.copy(alpha = 0.14f), shape = RoundedCornerShape(6.dp)) {
                                                    Text(
                                                        badgeLabel,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = badgeColor,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                                Text(
                                                    "${radar.docType} · ${radar.file.name}",
                                                    style = MaterialTheme.typography.labelLarge,
                                                    color = palette.text,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                    modifier = Modifier.weight(1f)
                                                )
                                            }
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Text(
                                                    "Expires ${radar.expiryDateIso}",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = palette.muted
                                                )
                                                FilledTonalButton(
                                                    onClick = {
                                                        brainViewModel.scheduleExpiryRenewalAlerts(radar) { count ->
                                                            toolsViewModel.postToast(
                                                                if (count > 0) "Scheduled $count renewal alert(s) in Second Brain"
                                                                else "Scheduled renewal reminder in Second Brain"
                                                            )
                                                        }
                                                    },
                                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                                    modifier = Modifier.testTag("radar_alert_btn_${radar.file.id}")
                                                ) {
                                                    Icon(Icons.Rounded.NotificationsActive, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(Modifier.width(4.dp))
                                                    Text("Set 30d/7d/1d Alerts", style = MaterialTheme.typography.labelSmall)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Bilingual 2×3 Smart Folders Grid
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Smart Folders", style = MaterialTheme.typography.titleMedium, color = palette.text)
                            if (selectedCategory != null) {
                                TextButton(onClick = { selectedCategory = null }) { Text("Show All (${cards.size})") }
                            }
                        }
                        SmartTaxonomy.SMART_CATEGORIES.chunked(2).forEach { rowCats ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                rowCats.forEach { cat ->
                                    val count = categoryCounts[cat.id] ?: 0
                                    val isSel = selectedCategory == cat.id
                                    val (icon, tint) = smartFolderStyle(
                                        cat.id,
                                        palette.accent,
                                        palette.success,
                                        palette.warning,
                                        palette.danger,
                                        palette.purpleAccent,
                                        palette.cyanAccent
                                    )
                                    Surface(
                                        color = if (isSel) tint.copy(alpha = 0.16f) else palette.surface,
                                        shape = RoundedCornerShape(14.dp),
                                        shadowElevation = 1.dp,
                                        modifier = Modifier
                                            .weight(1f)
                                            .border(
                                                width = if (isSel) 2.dp else 1.dp,
                                                color = if (isSel) tint else palette.border,
                                                shape = RoundedCornerShape(14.dp)
                                            )
                                            .clip(RoundedCornerShape(14.dp))
                                            .clickable { selectedCategory = if (isSel) null else cat.id }
                                            .testTag("smart_folder_${cat.id}")
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Surface(
                                                color = tint.copy(alpha = 0.14f),
                                                shape = RoundedCornerShape(10.dp),
                                                modifier = Modifier.size(36.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
                                                }
                                            }
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    cat.label.substringBefore(" &"),
                                                    style = MaterialTheme.typography.labelLarge,
                                                    color = palette.text,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Text(
                                                    cat.hindi,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = palette.muted,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                            Text(
                                                "$count",
                                                style = MaterialTheme.typography.titleMedium,
                                                color = tint,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }
                            }
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
                    },
                    Triple("Pick from Indexed Vault", "Promote an already indexed document to Smart Cards", Icons.Rounded.FolderShared) to {
                        showAddSheet = false; showPickIndexedDialog = true
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

    if (showPickIndexedDialog) {
        val nonCards = remember(allFiles) { allFiles.filter { !it.isCard }.take(40) }
        AlertDialog(
            onDismissRequest = { showPickIndexedDialog = false },
            containerColor = palette.surface,
            title = { Text("Promote Indexed Document", color = palette.text) },
            text = {
                if (nonCards.isEmpty()) {
                    Text("All indexed documents are already in Smart Cards.", color = palette.muted)
                } else {
                    LazyColumn(modifier = Modifier.height(320.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(nonCards, key = { it.id }) { doc ->
                            Surface(
                                color = palette.surface2,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth().clickable {
                                    showPickIndexedDialog = false
                                    onNavigate(CreateCardRoute(doc.uri, doc.id, doc.name, doc.customTag))
                                }
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text(doc.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${FormatUtils.formatSize(doc.size)} · ${doc.extension.uppercase()}", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showPickIndexedDialog = false }) { Text("Close") } }
        )
    }

    detailCard?.let { card ->
        val related = remember(card, cards) { SmartTaxonomy.findRelatedCards(card, cards) }
        val ocrExtract = remember(card) { (card.ocrText ?: card.contentText).orEmpty().trim() }
        AlertDialog(
            onDismissRequest = { detailCard = null },
            containerColor = palette.surface,
            title = { Text(card.name, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    FileThumbnail(file = card, engine = toolsViewModel.engine, modifier = Modifier.fillMaxWidth().height(150.dp))
                    Text("Tag: ${card.customTag.ifBlank { "Document" }} · ${FormatUtils.formatSize(card.size)}", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        if (ocrExtract.isNotBlank()) {
                            FilledTonalButton(
                                onClick = {
                                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    cm.setPrimaryClip(ClipData.newPlainText(card.name, ocrExtract))
                                    toolsViewModel.postToast("Copied card OCR text")
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Copy OCR")
                            }
                        }
                        OutlinedButton(
                            onClick = { FormatUtils.shareFileOrText(context, card.uri, ocrExtract.ifBlank { card.name }, card.name) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Share")
                        }
                    }
                    FilledTonalButton(
                        onClick = {
                            detailCard = null
                            toolsViewModel.shareMaskedDocument(context, card)
                        },
                        modifier = Modifier.fillMaxWidth().testTag("card_mask_share_btn")
                    ) {
                        Icon(Icons.Rounded.PrivacyTip, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Mask Sensitive IDs & Share Safely")
                    }
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
                Button(onClick = { previewCard = card; detailCard = null }) { Text("Full Preview") }
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
            onOpenSignature = { pageIdx -> signatureCard = file to pageIdx },
            onOpenPageOrganizer = {
                previewCard = null
                onNavigate(PageOrganizerRoute(file.uri, file.name))
            },
            onApplyFilterOrRotate = { filter, rot ->
                toolsViewModel.applyImageFilterOrRotate(file, filter, rot)
            },
            onShareMasked = {
                toolsViewModel.shareMaskedDocument(context, file)
            }
        )
    }

    watermarkCard?.let { c ->
        DocumentWatermarkDialog(onDismiss = { watermarkCard = null }, onApply = { t, col, a ->
            toolsViewModel.applyImageWatermark(c, t, col, a)
            watermarkCard = null
        })
    }
    signatureCard?.let { (c, pageIdx) ->
        DocumentSignatureDialog(
            onDismiss = { signatureCard = null },
            onApply = { bmp ->
                toolsViewModel.applyImageSignature(c, bmp, pageIdx)
                signatureCard = null
            },
            savedSignatures = savedSignatures,
            onSaveSignatureForReuse = { toolsViewModel.saveSignatureForReuse(it) },
            onDeleteSavedSignature = { toolsViewModel.deleteSavedSignature(it) },
            onApplyWithPlacement = { bmp, placement ->
                toolsViewModel.applyImageSignature(c, bmp, pageIdx, placement)
                signatureCard = null
            }
        )
    }
}

private fun smartFolderStyle(
    id: String,
    accent: Color,
    success: Color,
    warning: Color,
    danger: Color,
    purple: Color,
    cyan: Color
): Pair<ImageVector, Color> = when (id) {
    "medical" -> Icons.Rounded.LocalHospital to danger
    "vehicle" -> Icons.Rounded.DirectionsCar to warning
    "finance" -> Icons.Rounded.ReceiptLong to success
    "govt_id" -> Icons.Rounded.AccountBalance to accent
    "education" -> Icons.Rounded.School to purple
    else -> Icons.Rounded.Person to cyan
}
