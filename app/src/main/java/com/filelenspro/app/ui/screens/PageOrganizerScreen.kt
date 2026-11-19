package com.filelenspro.app.ui.screens

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.RotateLeft
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Compress
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.SelectAll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.filelenspro.app.data.model.PdfCompressPreset
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import java.io.File

@Composable
fun PageOrganizerScreen(
    initialPdfUri: String?,
    initialFileName: String?,
    toolsViewModel: ToolsViewModel,
    onScanAppend: (pdfUri: String) -> Unit,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val allPdfs by toolsViewModel.pdfAndScannedDocs.collectAsState()
    val pages by toolsViewModel.organizerPages.collectAsState()
    val isBusy by toolsViewModel.isOrganizerBusy.collectAsState()

    var activePdfUri by remember { mutableStateOf(initialPdfUri) }
    var skipNextLoadUri by remember { mutableStateOf<String?>(null) }
    var activeName by remember { mutableStateOf(initialFileName ?: "PDF Document") }
    var selectedIndices by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var showCompressDialog by remember { mutableStateOf(false) }

    fun adoptMaterializedUri(newUri: String) {
        skipNextLoadUri = newUri
        activePdfUri = newUri
    }

    BackHandler(onBack = onBack)

    LaunchedEffect(activePdfUri) {
        val uri = activePdfUri ?: return@LaunchedEffect
        if (skipNextLoadUri == uri) {
            skipNextLoadUri = null
            return@LaunchedEffect
        }
        selectedIndices = emptySet()
        toolsViewModel.loadOrganizerPages(uri, forceRefresh = false)
    }

    val mergeLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val primary = activePdfUri
        if (uri != null && primary != null) {
            toolsViewModel.mergeAnotherPdf(primary, uri) { newUri ->
                adoptMaterializedUri(newUri)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = palette.text)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("PDF Page Organizer", style = MaterialTheme.typography.titleLarge, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(activeName, style = MaterialTheme.typography.bodyMedium, color = palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (activePdfUri != null) {
                    IconButton(
                        onClick = {
                            selectedIndices = if (selectedIndices.size == pages.size) emptySet() else pages.indices.toSet()
                        },
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("organizer_select_all_btn")
                    ) {
                        Icon(
                            Icons.Rounded.SelectAll,
                            contentDescription = "Select All Pages",
                            tint = if (selectedIndices.size == pages.size && pages.isNotEmpty()) palette.accent else palette.text
                        )
                    }
                    IconButton(
                        onClick = { onScanAppend(activePdfUri!!) },
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("organizer_scan_append_btn")
                    ) {
                        Icon(Icons.Rounded.DocumentScanner, contentDescription = "Scan & Append Pages", tint = palette.accent)
                    }
                    OutlinedButton(
                        onClick = { mergeLauncher.launch(arrayOf("application/pdf")) },
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Merge")
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
        ) {
            if (isBusy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            if (activePdfUri == null) {
                val pdfOnly = remember(allPdfs) { allPdfs.filter { it.extension.equals("pdf", true) } }
                if (pdfOnly.isEmpty()) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("No PDFs indexed yet. Scan or import a PDF first.", color = palette.muted)
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        item {
                            Text("Choose a PDF to Organize", style = MaterialTheme.typography.titleMedium, color = palette.text)
                        }
                        items(pdfOnly, key = { it.id }) { doc ->
                            Surface(
                                color = palette.surface,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable {
                                        activePdfUri = doc.uri
                                        activeName = doc.name
                                        selectedIndices = emptySet()
                                    }
                            ) {
                                Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.danger)
                                    Spacer(Modifier.width(12.dp))
                                    Column {
                                        Text(doc.name, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text("${doc.pageCount} pages", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // Slim status + hint bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = if (selectedIndices.isEmpty()) {
                            "${pages.size} page(s) · Tap to select or tap ↻ to rotate"
                        } else {
                            "${selectedIndices.size} of ${pages.size} selected"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = if (selectedIndices.isNotEmpty()) palette.accent else palette.muted,
                        fontWeight = if (selectedIndices.isNotEmpty()) FontWeight.SemiBold else FontWeight.Normal
                    )
                    if (selectedIndices.isNotEmpty()) {
                        TextButton(
                            onClick = { selectedIndices = emptySet() },
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                        ) {
                            Text("Clear", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }

                val uri = activePdfUri!!

                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 112.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    itemsIndexed(
                        items = pages,
                        key = { idx, imgPath -> "${idx}_$imgPath" }
                    ) { idx, imgPath ->
                        val isSel = idx in selectedIndices
                        val imgRequest = remember(imgPath) {
                            ImageRequest.Builder(context)
                                .data(File(imgPath))
                                .memoryCacheKey(imgPath)
                                .diskCacheKey(imgPath)
                                .build()
                        }

                        Surface(
                            color = palette.surface2,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .height(168.dp)
                                .border(
                                    width = if (isSel) 2.5.dp else 1.dp,
                                    color = if (isSel) palette.accent else palette.border,
                                    shape = RoundedCornerShape(14.dp)
                                )
                                .clip(RoundedCornerShape(14.dp))
                                .clickable {
                                    selectedIndices = if (isSel) selectedIndices - idx else selectedIndices + idx
                                }
                                .testTag("organizer_page_$idx")
                        ) {
                            Box(modifier = Modifier.fillMaxSize()) {
                                // Crisp uncropped paper preview so 90°/180°/270° rotation is immediately visible
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 30.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    AsyncImage(
                                        model = imgRequest,
                                        contentDescription = "Page ${idx + 1}",
                                        contentScale = ContentScale.Fit,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .shadow(2.dp, RoundedCornerShape(4.dp))
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color.White)
                                    )
                                }

                                // Page Number Pill
                                Surface(
                                    color = if (isSel) palette.accent else palette.surface.copy(alpha = 0.94f),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier
                                        .align(Alignment.BottomStart)
                                        .padding(6.dp)
                                        .border(1.dp, if (isSel) palette.accent else palette.border, RoundedCornerShape(8.dp))
                                ) {
                                    Text(
                                        text = "P${idx + 1}",
                                        color = if (isSel) Color.White else palette.text,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                                    )
                                }

                                // One-tap quick 90° rotate button directly on each page tile
                                Surface(
                                    color = palette.surface.copy(alpha = 0.95f),
                                    shape = CircleShape,
                                    shadowElevation = 2.dp,
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(5.dp)
                                        .size(30.dp)
                                        .border(1.dp, palette.border, CircleShape)
                                        .clip(CircleShape)
                                        .clickable(enabled = !isBusy) {
                                            toolsViewModel.rotateOrganizerPages(uri, setOf(idx), 90) { newUri ->
                                                adoptMaterializedUri(newUri)
                                            }
                                        }
                                        .testTag("organizer_quick_rotate_$idx")
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.AutoMirrored.Rounded.RotateRight,
                                            contentDescription = "Rotate Page ${idx + 1} Right",
                                            tint = palette.accent,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                if (isSel) {
                                    Surface(
                                        color = palette.surface,
                                        shape = CircleShape,
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(6.dp)
                                            .size(24.dp)
                                    ) {
                                        Icon(
                                            Icons.Rounded.CheckCircle,
                                            contentDescription = "Selected",
                                            tint = palette.accent,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Page Actions Bar
                Surface(
                    color = palette.surface,
                    tonalElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val singleIdx = selectedIndices.singleOrNull()
                        FilledTonalButton(
                            enabled = selectedIndices.isNotEmpty() && !isBusy,
                            onClick = {
                                toolsViewModel.rotateOrganizerPages(uri, selectedIndices, -90) { newUri ->
                                    adoptMaterializedUri(newUri)
                                }
                            },
                            modifier = Modifier.testTag("organizer_rotate_left_btn")
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.RotateLeft, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Left")
                        }
                        FilledTonalButton(
                            enabled = selectedIndices.isNotEmpty() && !isBusy,
                            onClick = {
                                toolsViewModel.rotateOrganizerPages(uri, selectedIndices, 90) { newUri ->
                                    adoptMaterializedUri(newUri)
                                }
                            },
                            modifier = Modifier.testTag("organizer_rotate_right_btn")
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Right")
                        }
                        if (singleIdx != null) {
                            OutlinedButton(
                                enabled = singleIdx > 0 && !isBusy,
                                onClick = {
                                    toolsViewModel.moveOrganizerPage(uri, singleIdx, singleIdx - 1) { newUri ->
                                        adoptMaterializedUri(newUri)
                                    }
                                    selectedIndices = setOf(singleIdx - 1)
                                }
                            ) {
                                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Earlier")
                            }
                            OutlinedButton(
                                enabled = singleIdx < pages.lastIndex && !isBusy,
                                onClick = {
                                    toolsViewModel.moveOrganizerPage(uri, singleIdx, singleIdx + 1) { newUri ->
                                        adoptMaterializedUri(newUri)
                                    }
                                    selectedIndices = setOf(singleIdx + 1)
                                }
                            ) {
                                Text("Later")
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            OutlinedButton(
                                enabled = !isBusy,
                                onClick = {
                                    toolsViewModel.duplicateOrganizerPage(uri, singleIdx) { newUri ->
                                        adoptMaterializedUri(newUri)
                                    }
                                }
                            ) {
                                Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Duplicate")
                            }
                        }
                        FilledTonalButton(
                            enabled = pages.isNotEmpty() && !isBusy,
                            onClick = { showCompressDialog = true },
                            modifier = Modifier.testTag("organizer_compress_pdf_btn")
                        ) {
                            Icon(Icons.Rounded.Compress, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Compress")
                        }
                        FilledTonalButton(
                            enabled = selectedIndices.isNotEmpty() && !isBusy,
                            onClick = { toolsViewModel.extractOrganizerPages(uri, selectedIndices, activeName) }
                        ) {
                            Icon(Icons.Rounded.ContentCut, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Extract")
                        }
                        Button(
                            enabled = selectedIndices.isNotEmpty() && selectedIndices.size < pages.size && !isBusy,
                            colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                            onClick = {
                                toolsViewModel.deleteOrganizerPages(uri, selectedIndices) { newUri ->
                                    adoptMaterializedUri(newUri)
                                }
                                selectedIndices = emptySet()
                            }
                        ) {
                            Icon(Icons.Rounded.DeleteOutline, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Delete")
                        }
                    }
                }
            }
        }
    }

    if (showCompressDialog && activePdfUri != null) {
        val currentUri = activePdfUri!!
        AlertDialog(
            onDismissRequest = { showCompressDialog = false },
            containerColor = palette.surface,
            title = { Text("Compress PDF", color = palette.text, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Choose target quality to shrink embedded images & file size while preserving clarity:",
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.muted
                    )
                    PdfCompressPreset.entries.forEach { preset ->
                        Surface(
                            color = palette.surface2,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    showCompressDialog = false
                                    toolsViewModel.compressPdfInOrganizer(currentUri, preset) { newUri ->
                                        adoptMaterializedUri(newUri)
                                    }
                                }
                                .testTag("organizer_compress_preset_${preset.name.lowercase()}")
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(preset.label, style = MaterialTheme.typography.titleSmall, color = palette.text, fontWeight = FontWeight.Bold)
                                Text(preset.subtitle, style = MaterialTheme.typography.labelSmall, color = palette.muted)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showCompressDialog = false }) { Text("Cancel") }
            }
        )
    }
}
