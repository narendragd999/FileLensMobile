package com.filelenspro.app.ui.screens

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Compress
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.filelenspro.app.data.model.CleanerCategory
import com.filelenspro.app.data.model.PdfCompressPreset
import com.filelenspro.app.data.model.PhotoCompressPreset
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@Composable
fun FileAnalyserScreen(
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val analysis by toolsViewModel.storageAnalysis.collectAsState()
    val junk by toolsViewModel.junkStats.collectAsState()
    val duplicates by toolsViewModel.duplicates.collectAsState()
    val visualClusters by toolsViewModel.visualClusters.collectAsState()
    val semanticGroups by toolsViewModel.semanticDuplicates.collectAsState()
    val isAnalyzing by toolsViewModel.isAnalyzing.collectAsState()

    val compressCandidates by toolsViewModel.compressCandidates.collectAsState()
    val compressPreset by toolsViewModel.compressPreset.collectAsState()
    val isCompressingPhotos by toolsViewModel.isCompressingPhotos.collectAsState()
    val compressProgress by toolsViewModel.compressProgress.collectAsState()
    val lastCompressSummary by toolsViewModel.lastCompressSummary.collectAsState()

    val pdfCompressCandidates by toolsViewModel.pdfCompressCandidates.collectAsState()
    val pdfCompressPreset by toolsViewModel.pdfCompressPreset.collectAsState()
    val isCompressingPdfs by toolsViewModel.isCompressingPdfs.collectAsState()
    val pdfCompressProgress by toolsViewModel.pdfCompressProgress.collectAsState()
    val lastPdfCompressSummary by toolsViewModel.lastPdfCompressSummary.collectAsState()
    val cleanerItems by toolsViewModel.cleanerItems.collectAsState()

    var activeTab by remember { mutableIntStateOf(0) }
    var replaceOriginals by remember { mutableStateOf(true) }
    var replacePdfOriginals by remember { mutableStateOf(true) }
    var useWebpFormat by remember { mutableStateOf(false) }
    var selectedCleanerCategory by remember { mutableStateOf<CleanerCategory?>(null) }

    val galleryShrinkPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(30)
    ) { uris ->
        if (uris.isNotEmpty()) {
            toolsViewModel.compressExternalPhotoUris(uris, useWebp = useWebpFormat)
        }
    }

    LaunchedEffect(Unit) {
        toolsViewModel.runStorageAnalysis()
    }
    BackHandler(onBack = onBack)

    val selectedShrinkCount = remember(compressCandidates) { compressCandidates.count { it.selected } }
    val estimatedTotalSavings = remember(compressCandidates) {
        compressCandidates.filter { it.selected }.sumOf { it.estimatedSavedBytes }
    }
    val allEstimatedSavings = remember(compressCandidates) {
        compressCandidates.sumOf { it.estimatedSavedBytes }
    }

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
                    Text("Space Cleaner & Analyser", style = MaterialTheme.typography.titleLarge, color = palette.text, fontWeight = FontWeight.Bold)
                    Text("Smart Photo Shrink · Duplicates · dHash · Semantic", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                }
                IconButton(onClick = { toolsViewModel.runStorageAnalysis() }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Re-scan Storage", tint = palette.accent)
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            val tabs = listOf(
                "Overview",
                "Shrink Photos (${compressCandidates.size})",
                "Shrink PDFs (${pdfCompressCandidates.size})",
                "Smart Cleanup (${cleanerItems.size})",
                "Junk (${FormatUtils.formatSize(junk?.totalJunkBytes ?: 0L)})",
                "Duplicates (${duplicates.size})",
                "Similar (${visualClusters.size})",
                "Semantic (${semanticGroups.size})",
                "Large Files"
            )
            ScrollableTabRow(
                selectedTabIndex = activeTab,
                containerColor = palette.surface,
                contentColor = palette.accent,
                edgePadding = 10.dp
            ) {
                tabs.forEachIndexed { idx, label ->
                    Tab(
                        selected = activeTab == idx,
                        onClick = { activeTab = idx },
                        text = { Text(label) },
                        modifier = Modifier.testTag("analyser_tab_$idx")
                    )
                }
            }

            if (isAnalyzing) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            LazyColumn(
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                when (activeTab) {
                    // ─── TAB 0: OVERVIEW ───
                    0 -> {
                        val a = analysis
                        if (a != null) {
                            item {
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(16.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                ) {
                                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("Device Storage", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                        val ratio = if (a.totalDeviceBytes > 0) a.usedDeviceBytes.toFloat() / a.totalDeviceBytes else 0f
                                        LinearProgressIndicator(
                                            progress = { ratio.coerceIn(0f, 1f) },
                                            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(6.dp))
                                        )
                                        Text(
                                            "Used ${FormatUtils.formatSize(a.usedDeviceBytes)} of ${FormatUtils.formatSize(a.totalDeviceBytes)} · Free ${FormatUtils.formatSize(a.freeDeviceBytes)}",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = palette.muted
                                        )
                                        Text(
                                            "Indexed Vault Footprint: ${FormatUtils.formatSize(a.appIndexedBytes)}",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = palette.accent
                                        )
                                        // Multi-segment visual vault storage breakdown bar
                                        val totalIndexed = a.categories.sumOf { it.bytes }.coerceAtLeast(1L)
                                        val segmentColors = listOf(
                                            palette.danger,
                                            palette.accent,
                                            palette.success,
                                            palette.warning,
                                            palette.purpleAccent,
                                            palette.cyanAccent
                                        )
                                        if (a.categories.any { it.bytes > 0L }) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(10.dp)
                                                    .clip(RoundedCornerShape(6.dp))
                                                    .background(palette.surface2),
                                                horizontalArrangement = Arrangement.spacedBy(2.dp)
                                            ) {
                                                a.categories.forEachIndexed { idx, cat ->
                                                    val weight = (cat.bytes.toFloat() / totalIndexed.toFloat()).coerceAtLeast(0.03f)
                                                    if (cat.bytes > 0L) {
                                                        Box(
                                                            modifier = Modifier
                                                                .weight(weight)
                                                                .fillMaxSize()
                                                                .background(segmentColors[idx % segmentColors.size])
                                                        )
                                                    }
                                                }
                                            }
                                            Row(
                                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                a.categories.forEachIndexed { idx, cat ->
                                                    if (cat.bytes > 0L) {
                                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                            Box(
                                                                modifier = Modifier
                                                                    .size(8.dp)
                                                                    .clip(RoundedCornerShape(4.dp))
                                                                    .background(segmentColors[idx % segmentColors.size])
                                                            )
                                                            Text(
                                                                "${cat.label} (${FormatUtils.formatSize(cat.bytes)})",
                                                                style = MaterialTheme.typography.labelSmall,
                                                                color = palette.muted
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Highlight Card: Smart Photo Shrink without Losing Quality
                            item {
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(16.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(
                                            1.5.dp,
                                            Brush.horizontalGradient(listOf(palette.success, palette.accent)),
                                            RoundedCornerShape(16.dp)
                                        )
                                        .clip(RoundedCornerShape(16.dp))
                                        .clickable { activeTab = 1 }
                                        .testTag("overview_photo_shrink_card")
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .background(palette.success.copy(alpha = 0.08f))
                                            .padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(44.dp)
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(palette.success.copy(alpha = 0.16f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(Icons.Rounded.Compress, contentDescription = null, tint = palette.success, modifier = Modifier.size(24.dp))
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                "Smart Photo Shrink (Zero Quality Loss)",
                                                style = MaterialTheme.typography.titleMedium,
                                                color = palette.text,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                if (compressCandidates.isNotEmpty())
                                                    "${compressCandidates.size} photos can reclaim ~${FormatUtils.formatSize(allEstimatedSavings)} while keeping crisp visual clarity"
                                                else
                                                    "Pick any gallery photos to shrink file size up to 60% with visually lossless optimization",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = palette.muted
                                            )
                                        }
                                        Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = "Open Photo Shrink", tint = palette.success)
                                    }
                                }
                            }

                            // Highlight Card: Smart PDF Compressor
                            item {
                                val pdfEstSavings = remember(pdfCompressCandidates) {
                                    pdfCompressCandidates.sumOf { it.estimatedSavedBytes }
                                }
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(16.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(1.dp, palette.accent.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
                                        .clip(RoundedCornerShape(16.dp))
                                        .clickable { activeTab = 2 }
                                        .testTag("overview_pdf_shrink_card")
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .background(palette.accent.copy(alpha = 0.06f))
                                            .padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(44.dp)
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(palette.accent.copy(alpha = 0.16f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.accent, modifier = Modifier.size(24.dp))
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Smart PDF Compressor", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text(
                                                if (pdfCompressCandidates.isNotEmpty())
                                                    "${pdfCompressCandidates.size} PDF(s) can save ~${FormatUtils.formatSize(pdfEstSavings)} with Email/Balanced/Print presets"
                                                else
                                                    "Shrink large scanned PDFs for fast email & WhatsApp sharing",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = palette.muted
                                            )
                                        }
                                        Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = "Open PDF Shrink", tint = palette.accent)
                                    }
                                }
                            }

                            items(a.categories) { cat ->
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                ) {
                                    Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(cat.label, style = MaterialTheme.typography.titleMedium, color = palette.text, modifier = Modifier.weight(1f))
                                        Text("${cat.count} files · ${FormatUtils.formatSize(cat.bytes)}", style = MaterialTheme.typography.labelLarge, color = palette.accent)
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 1: SMART PHOTO SHRINK (VISUALLY LOSSLESS) ───
                    1 -> {
                        item {
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            ) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Icon(Icons.Rounded.AutoFixHigh, contentDescription = null, tint = palette.success, modifier = Modifier.size(20.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Smart Photo Compressor", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text("Adaptive encoding + EXIF thumbnail stripping · Never enlarges already-optimized files", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                    }

                                    // Quality Preset Chips
                                    Row(
                                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        PhotoCompressPreset.entries.forEach { preset ->
                                            FilterChip(
                                                selected = compressPreset == preset,
                                                onClick = { toolsViewModel.setCompressPreset(preset) },
                                                label = { Text(preset.label) },
                                                colors = FilterChipDefaults.filterChipColors(
                                                    selectedContainerColor = palette.success,
                                                    selectedLabelColor = Color.White
                                                ),
                                                modifier = Modifier.testTag("shrink_preset_${preset.name.lowercase()}")
                                            )
                                        }
                                    }

                                    Text(
                                        text = "${compressPreset.subtitle} (Quality ${compressPreset.quality}% · Max ${compressPreset.maxDimension}px)",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = palette.accent
                                    )

                                    // Replace Original vs Copy + High-Efficiency WebP Toggles
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Replace Original (Reclaim Space)", style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.Medium)
                                            Text(
                                                if (replaceOriginals) "Overwrites writable photos in-place to free storage immediately" else "Keeps original & saves shrunken copy in Compressed folder",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.muted
                                            )
                                        }
                                        Switch(
                                            checked = replaceOriginals,
                                            onCheckedChange = { replaceOriginals = it },
                                            modifier = Modifier.testTag("shrink_replace_switch")
                                        )
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("High-Efficiency WebP Format", style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.Medium)
                                            Text("Extra ~25% smaller at identical sharpness vs JPEG", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                        Switch(
                                            checked = useWebpFormat,
                                            onCheckedChange = { useWebpFormat = it },
                                            modifier = Modifier.testTag("shrink_webp_switch")
                                        )
                                    }

                                    // Zero-Permission Gallery Picker Action
                                    FilledTonalButton(
                                        enabled = !isCompressingPhotos,
                                        onClick = {
                                            galleryShrinkPicker.launch(
                                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                            )
                                        },
                                        modifier = Modifier.fillMaxWidth().testTag("shrink_pick_gallery_btn")
                                    ) {
                                        Icon(Icons.Rounded.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text("Pick Any Gallery Photos to Shrink (Up to 30)")
                                    }
                                }
                            }
                        }

                        // Live Compression Progress Bar
                        if (isCompressingPhotos) {
                            item {
                                val (done, total) = compressProgress
                                val ratio = if (total > 0) done.toFloat() / total.toFloat() else 0f
                                Surface(
                                    color = palette.accent.copy(alpha = 0.1f),
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.accent.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
                                ) {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(
                                            "Optimizing photos… ($done / $total)",
                                            style = MaterialTheme.typography.titleSmall,
                                            color = palette.accent,
                                            fontWeight = FontWeight.Bold
                                        )
                                        LinearProgressIndicator(
                                            progress = { ratio.coerceIn(0f, 1f) },
                                            modifier = Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(6.dp))
                                        )
                                    }
                                }
                            }
                        }

                        // Last Compression Result Banner
                        val summary = lastCompressSummary
                        if (summary != null && !isCompressingPhotos) {
                            item {
                                Surface(
                                    color = palette.success.copy(alpha = 0.11f),
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.success.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = palette.success, modifier = Modifier.size(22.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                "Saved ${FormatUtils.formatSize(summary.savedBytes)} across ${summary.processedCount} photo(s)",
                                                style = MaterialTheme.typography.titleSmall,
                                                color = palette.text,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                "${FormatUtils.formatSize(summary.originalTotalBytes)} → ${FormatUtils.formatSize(summary.compressedTotalBytes)}" +
                                                    if (summary.skippedAlreadyOptimal > 0) " · ${summary.skippedAlreadyOptimal} already optimal" else "",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.muted
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Indexed Photos Candidates Batch Controls
                        if (compressCandidates.isNotEmpty()) {
                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    val allSelected = selectedShrinkCount == compressCandidates.size
                                    TextButton(
                                        onClick = { toolsViewModel.selectAllCompressCandidates(!allSelected) },
                                        modifier = Modifier.testTag("shrink_select_all_btn")
                                    ) {
                                        Text(if (allSelected) "Deselect All" else "Select All (${compressCandidates.size})")
                                    }
                                    Button(
                                        enabled = selectedShrinkCount > 0 && !isCompressingPhotos,
                                        onClick = {
                                            toolsViewModel.compressSelectedPhotos(
                                                replaceOriginal = replaceOriginals,
                                                useWebp = useWebpFormat
                                            )
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.success),
                                        modifier = Modifier.weight(1f).testTag("shrink_execute_btn")
                                    ) {
                                        Icon(Icons.Rounded.Compress, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            if (selectedShrinkCount > 0)
                                                "Shrink $selectedShrinkCount (~${FormatUtils.formatSize(estimatedTotalSavings)})"
                                            else
                                                "Select Photos"
                                        )
                                    }
                                }
                            }

                            items(compressCandidates, key = { it.id }) { cand ->
                                val thumbKey = "${cand.uri}_${cand.sizeBytes}_${cand.estimatedSavedBytes}"
                                val estNewSize = (cand.sizeBytes - cand.estimatedSavedBytes).coerceAtLeast(1L)
                                val pctSave = if (cand.sizeBytes > 0) ((cand.estimatedSavedBytes * 100) / cand.sizeBytes).toInt() else 0
                                val req = remember(thumbKey) {
                                    ImageRequest.Builder(context)
                                        .data(cand.uri)
                                        .memoryCacheKey(thumbKey)
                                        .diskCacheKey(thumbKey)
                                        .crossfade(true)
                                        .build()
                                }
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(
                                            1.dp,
                                            if (cand.selected) palette.success.copy(alpha = 0.55f) else palette.border,
                                            RoundedCornerShape(14.dp)
                                        )
                                        .clip(RoundedCornerShape(14.dp))
                                        .clickable { toolsViewModel.toggleCompressCandidate(cand.id) }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        AsyncImage(
                                            model = req,
                                            contentDescription = cand.name,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.size(54.dp).clip(RoundedCornerShape(10.dp))
                                        )
                                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                            Text(
                                                cand.name,
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = palette.text,
                                                fontWeight = FontWeight.SemiBold,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Text(
                                                    "${FormatUtils.formatSize(cand.sizeBytes)} → ~${FormatUtils.formatSize(estNewSize)}",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = palette.muted
                                                )
                                                Surface(
                                                    color = palette.success.copy(alpha = 0.14f),
                                                    shape = RoundedCornerShape(6.dp)
                                                ) {
                                                    Text(
                                                        "-$pctSave%",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = palette.success,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                                                    )
                                                }
                                            }
                                            if (cand.width > 0 && cand.height > 0) {
                                                Text(
                                                    "${cand.width} × ${cand.height} px",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = palette.dim
                                                )
                                            }
                                        }
                                        Icon(
                                            if (cand.selected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                            contentDescription = if (cand.selected) "Selected" else "Not Selected",
                                            tint = if (cand.selected) palette.success else palette.muted
                                        )
                                    }
                                }
                            }
                        } else {
                            item {
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                ) {
                                    Column(
                                        modifier = Modifier.padding(20.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Rounded.Compress, contentDescription = null, tint = palette.accent, modifier = Modifier.size(36.dp))
                                        Text("No Large Indexed Photos Found", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text(
                                            "Index your device photos or tap \"Pick Any Gallery Photos to Shrink\" above to compress photos directly.",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = palette.muted
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 2: SMART PDF COMPRESSOR ───
                    2 -> {
                        val selectedPdfCount = pdfCompressCandidates.count { it.selected }
                        val estPdfSavings = pdfCompressCandidates.filter { it.selected }.sumOf { it.estimatedSavedBytes }
                        item {
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            ) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.accent, modifier = Modifier.size(20.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Smart PDF Compressor", style = MaterialTheme.typography.titleMedium, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text("Re-encodes heavy page scans while preserving readability", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                    }
                                    Row(
                                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        PdfCompressPreset.entries.forEach { preset ->
                                            FilterChip(
                                                selected = pdfCompressPreset == preset,
                                                onClick = { toolsViewModel.setPdfCompressPreset(preset) },
                                                label = { Text(preset.label) },
                                                colors = FilterChipDefaults.filterChipColors(
                                                    selectedContainerColor = palette.accent,
                                                    selectedLabelColor = Color.White
                                                ),
                                                modifier = Modifier.testTag("pdf_shrink_preset_${preset.name.lowercase()}")
                                            )
                                        }
                                    }
                                    Text(pdfCompressPreset.subtitle, style = MaterialTheme.typography.labelMedium, color = palette.accent)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Replace Original PDF", style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.Medium)
                                            Text(
                                                if (replacePdfOriginals) "Overwrites writable PDFs in-place to reclaim space immediately" else "Saves compact copy in CompressedPdfs folder",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.muted
                                            )
                                        }
                                        Switch(checked = replacePdfOriginals, onCheckedChange = { replacePdfOriginals = it })
                                    }
                                }
                            }
                        }
                        if (isCompressingPdfs) {
                            item {
                                val (done, total) = pdfCompressProgress
                                val ratio = if (total > 0) done.toFloat() / total.toFloat() else 0f
                                Surface(
                                    color = palette.accent.copy(alpha = 0.1f),
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.accent.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
                                ) {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("Compressing PDFs… ($done / $total)", style = MaterialTheme.typography.titleSmall, color = palette.accent, fontWeight = FontWeight.Bold)
                                        LinearProgressIndicator(progress = { ratio.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(6.dp)))
                                    }
                                }
                            }
                        }
                        val pdfSummary = lastPdfCompressSummary
                        if (pdfSummary != null && !isCompressingPdfs) {
                            item {
                                Surface(
                                    color = palette.success.copy(alpha = 0.11f),
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.success.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                                ) {
                                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = palette.success, modifier = Modifier.size(22.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text("Saved ${FormatUtils.formatSize(pdfSummary.savedBytes)} across ${pdfSummary.processedCount} PDF(s)", style = MaterialTheme.typography.titleSmall, color = palette.text, fontWeight = FontWeight.Bold)
                                            Text("${FormatUtils.formatSize(pdfSummary.originalTotalBytes)} → ${FormatUtils.formatSize(pdfSummary.compressedTotalBytes)}", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                    }
                                }
                            }
                        }
                        if (pdfCompressCandidates.isNotEmpty()) {
                            item {
                                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    val allSel = selectedPdfCount == pdfCompressCandidates.size
                                    TextButton(onClick = { toolsViewModel.selectAllPdfCompressCandidates(!allSel) }) {
                                        Text(if (allSel) "Deselect All" else "Select All (${pdfCompressCandidates.size})")
                                    }
                                    Button(
                                        enabled = selectedPdfCount > 0 && !isCompressingPdfs,
                                        onClick = { toolsViewModel.compressSelectedPdfs(replaceOriginal = replacePdfOriginals) },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                        modifier = Modifier.weight(1f).testTag("pdf_shrink_execute_btn")
                                    ) {
                                        Icon(Icons.Rounded.Compress, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(if (selectedPdfCount > 0) "Compress $selectedPdfCount (~${FormatUtils.formatSize(estPdfSavings)})" else "Select PDFs")
                                    }
                                }
                            }
                            items(pdfCompressCandidates, key = { it.id }) { cand ->
                                val estNew = (cand.sizeBytes - cand.estimatedSavedBytes).coerceAtLeast(1L)
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(1.dp, if (cand.selected) palette.accent.copy(alpha = 0.55f) else palette.border, RoundedCornerShape(14.dp))
                                        .clip(RoundedCornerShape(14.dp))
                                        .clickable { toolsViewModel.togglePdfCompressCandidate(cand.id) }
                                ) {
                                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.danger, modifier = Modifier.size(30.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(cand.name, style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text("${cand.pageCount} pg · ${FormatUtils.formatSize(cand.sizeBytes)} → ~${FormatUtils.formatSize(estNew)}", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                        }
                                        Icon(
                                            if (cand.selected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                            contentDescription = "Select PDF",
                                            tint = if (cand.selected) palette.accent else palette.muted
                                        )
                                    }
                                }
                            }
                        } else {
                            item {
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                ) {
                                    Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.accent, modifier = Modifier.size(36.dp))
                                        Text("No Large PDFs Found", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("Indexed PDFs larger than 250 KB will appear here for 1-tap compression.", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 3: SMART CLEANUP (OLD DOWNLOADS, LEFTOVER APKS, LARGE VIDEOS) ───
                    3 -> {
                        val visibleCleaner = cleanerItems.filter { selectedCleanerCategory == null || it.category == selectedCleanerCategory }
                        val selCleanerCount = cleanerItems.count { it.selected }
                        val selCleanerBytes = cleanerItems.filter { it.selected }.sumOf { it.sizeBytes }
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    FilterChip(
                                        selected = selectedCleanerCategory == null,
                                        onClick = { selectedCleanerCategory = null },
                                        label = { Text("All (${cleanerItems.size})") }
                                    )
                                    CleanerCategory.entries.forEach { cat ->
                                        val count = cleanerItems.count { it.category == cat }
                                        FilterChip(
                                            selected = selectedCleanerCategory == cat,
                                            onClick = { selectedCleanerCategory = if (selectedCleanerCategory == cat) null else cat },
                                            label = { Text("${cat.label} ($count)") }
                                        )
                                    }
                                }
                                if (cleanerItems.isNotEmpty()) {
                                    Button(
                                        enabled = selCleanerCount > 0,
                                        onClick = { toolsViewModel.deleteSelectedCleanerItems() },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                                        modifier = Modifier.fillMaxWidth().testTag("smart_cleanup_delete_btn")
                                    ) {
                                        Icon(Icons.Rounded.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            if (selCleanerCount > 0) "Clean $selCleanerCount Item(s) · Free ${FormatUtils.formatSize(selCleanerBytes)}"
                                            else "Select Items to Clean"
                                        )
                                    }
                                }
                            }
                        }
                        if (visibleCleaner.isEmpty()) {
                            item {
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                ) {
                                    Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = palette.success, modifier = Modifier.size(36.dp))
                                        Text("Storage Looks Clean!", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("No leftover APKs, 90+ day old downloads, or oversized videos detected.", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    }
                                }
                            }
                        } else {
                            items(visibleCleaner, key = { it.path }) { item ->
                                Surface(
                                    color = palette.surface,
                                    shape = RoundedCornerShape(14.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .border(1.dp, if (item.selected) palette.danger.copy(alpha = 0.5f) else palette.border, RoundedCornerShape(14.dp))
                                        .clip(RoundedCornerShape(14.dp))
                                        .clickable { toolsViewModel.toggleCleanerItem(item.path) }
                                ) {
                                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            val ageDays = ((System.currentTimeMillis() - item.modifiedMs).coerceAtLeast(0L) / 86_400_000L)
                                            Text(item.name, style = MaterialTheme.typography.bodyMedium, color = palette.text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(
                                                "${item.category.label} · ${FormatUtils.formatSize(item.sizeBytes)} · ${ageDays}d old",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = palette.muted
                                            )
                                        }
                                        Icon(
                                            if (item.selected) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                            contentDescription = "Select item to clean",
                                            tint = if (item.selected) palette.danger else palette.muted
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 4: JUNK CACHE ───
                    4 -> {
                        val j = junk
                        item {
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            ) {
                                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Reclaimable App Cache", style = MaterialTheme.typography.titleLarge, color = palette.text)
                                    Text("PDF Render Cache: ${FormatUtils.formatSize(j?.pdfCacheBytes ?: 0)}", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    Text("Temp Scans & Crops: ${FormatUtils.formatSize(j?.tempCropBytes ?: 0)}", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    Text("Export Staging: ${FormatUtils.formatSize(j?.exportTempBytes ?: 0)}", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                                    Spacer(Modifier.height(4.dp))
                                    Button(
                                        onClick = { toolsViewModel.cleanJunkCache() },
                                        enabled = (j?.totalJunkBytes ?: 0L) > 0L,
                                        modifier = Modifier.fillMaxWidth().testTag("analyser_clean_junk_btn")
                                    ) {
                                        Icon(Icons.Rounded.CleaningServices, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Clean ${FormatUtils.formatSize(j?.totalJunkBytes ?: 0L)}")
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 5: EXACT DUPLICATES ───
                    5 -> {
                        if (duplicates.isNotEmpty()) {
                            item {
                                Button(
                                    onClick = { toolsViewModel.deleteSelectedDuplicates() },
                                    colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Rounded.DeleteSweep, contentDescription = null)
                                    Spacer(Modifier.width(6.dp))
                                    Text("Delete Selected Exact Duplicates")
                                }
                            }
                        }
                        items(duplicates, key = { it.hash }) { group ->
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(
                                        "${group.files.size} identical copies · ${FormatUtils.formatSize(group.size)} each",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.text
                                    )
                                    group.files.forEach { f ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable(enabled = !f.isOriginal) { toolsViewModel.toggleDuplicateSelection(group.hash, f.id) }
                                                .padding(vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                if (f.isOriginal) Icons.Rounded.CheckBoxOutlineBlank else if (f.selectedForDeletion) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                                contentDescription = null,
                                                tint = if (f.isOriginal) palette.success else palette.danger
                                            )
                                            Spacer(Modifier.width(8.dp))
                                            Text(
                                                if (f.isOriginal) "${f.name} (Keep Original)" else f.name,
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = palette.text,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 6: SIMILAR PHOTOS ───
                    6 -> {
                        if (visualClusters.isNotEmpty()) {
                            item {
                                Button(
                                    onClick = { toolsViewModel.deleteSelectedSimilarImages() },
                                    colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("Remove Blurry / Burst Duplicates") }
                            }
                        }
                        items(visualClusters, key = { it.clusterId }) { cluster ->
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Burst / Similar Photo Group (${cluster.items.size})", style = MaterialTheme.typography.titleMedium, color = palette.text)
                                    cluster.items.forEach { img ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable(enabled = !img.isBestShot) { toolsViewModel.toggleSimilarSelection(cluster.clusterId, img.id) },
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            AsyncImage(
                                                model = img.uri,
                                                contentDescription = img.name,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier.size(48.dp).clip(RoundedCornerShape(8.dp))
                                            )
                                            Spacer(Modifier.width(10.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(img.name, style = MaterialTheme.typography.bodyMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Text(
                                                    if (img.isBestShot) "Best Shot · Sharpness ${img.sharpness.toInt()}" else "Sharpness ${img.sharpness.toInt()} · Tap to toggle",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = if (img.isBestShot) palette.success else palette.muted
                                                )
                                            }
                                            if (!img.isBestShot) {
                                                Icon(
                                                    if (img.selectedForDeletion) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                                    contentDescription = null,
                                                    tint = palette.danger
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 7: SEMANTIC CLONES ───
                    7 -> {
                        if (semanticGroups.isNotEmpty()) {
                            item {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TextButton(onClick = { toolsViewModel.setAllSemanticSelected(true) }) { Text("Select All Clones") }
                                    Button(
                                        onClick = { toolsViewModel.deleteSelectedSemanticClones() },
                                        colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                                        modifier = Modifier.weight(1f)
                                    ) { Text("Delete Selected Clones") }
                                }
                            }
                        }
                        items(semanticGroups, key = { it.groupId }) { grp ->
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(
                                        "Near-Duplicate Content (${(grp.similarity * 100).toInt()}% similar)",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.accent,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    grp.files.forEachIndexed { idx, f ->
                                        val sel = f.id in grp.selectedIds
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable(enabled = idx > 0) { toolsViewModel.toggleSemanticSelection(grp.groupId, f.id) }
                                                .padding(vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                if (idx == 0) Icons.Rounded.CheckBoxOutlineBlank else if (sel) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                                contentDescription = null,
                                                tint = if (idx == 0) palette.success else palette.danger
                                            )
                                            Spacer(Modifier.width(8.dp))
                                            Text(
                                                if (idx == 0) "${f.name} (Primary Copy)" else "${f.name} · ${FormatUtils.formatSize(f.size)}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = palette.text
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // ─── TAB 8: LARGE FILES ───
                    8 -> {
                        val large = analysis?.largeFiles ?: emptyList()
                        items(large, key = { it.id }) { f ->
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth().border(1.dp, palette.border, RoundedCornerShape(14.dp))
                            ) {
                                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(f.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(FormatUtils.formatSize(f.size), style = MaterialTheme.typography.labelSmall, color = palette.danger)
                                    }
                                    TextButton(onClick = {
                                        toolsViewModel.deleteIndexedFile(f, true)
                                        toolsViewModel.runStorageAnalysis()
                                    }) {
                                        Text("Remove", color = palette.danger)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
