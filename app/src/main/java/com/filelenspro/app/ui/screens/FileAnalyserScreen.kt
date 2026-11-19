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
import androidx.compose.material.icons.rounded.CheckBox
import androidx.compose.material.icons.rounded.CheckBoxOutlineBlank
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils

@Composable
fun FileAnalyserScreen(
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val analysis by toolsViewModel.storageAnalysis.collectAsState()
    val junk by toolsViewModel.junkStats.collectAsState()
    val duplicates by toolsViewModel.duplicates.collectAsState()
    val visualClusters by toolsViewModel.visualClusters.collectAsState()
    val semanticGroups by toolsViewModel.semanticDuplicates.collectAsState()
    val isAnalyzing by toolsViewModel.isAnalyzing.collectAsState()

    var activeTab by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        toolsViewModel.runStorageAnalysis()
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
                    Text("Space Cleaner & Analyser", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("Exact SHA-256 · dHash Blur · Semantic Clones", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
                IconButton(onClick = { toolsViewModel.runStorageAnalysis() }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Re-scan Storage", tint = palette.accent)
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            val tabs = listOf(
                "Overview",
                "Junk (${FormatUtils.formatSize(junk?.totalJunkBytes ?: 0L)})",
                "Duplicates (${duplicates.size})",
                "Similar Photos (${visualClusters.size})",
                "Semantic (${semanticGroups.size})",
                "Large Files"
            )
            ScrollableTabRow(selectedTabIndex = activeTab, containerColor = palette.surface, contentColor = palette.accent, edgePadding = 10.dp) {
                tabs.forEachIndexed { idx, label ->
                    Tab(selected = activeTab == idx, onClick = { activeTab = idx }, text = { Text(label) })
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
                                        Text("Device Storage", style = MaterialTheme.typography.titleMedium, color = palette.text)
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

                    1 -> {
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

                    2 -> {
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

                    3 -> {
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

                    4 -> {
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

                    5 -> {
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
