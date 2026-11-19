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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCut
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.PictureAsPdf
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import java.io.File

@Composable
fun PageOrganizerScreen(
    initialPdfUri: String?,
    initialFileName: String?,
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val allPdfs by toolsViewModel.pdfAndScannedDocs.collectAsState()
    val pages by toolsViewModel.organizerPages.collectAsState()
    val isBusy by toolsViewModel.isOrganizerBusy.collectAsState()

    var activePdfUri by remember { mutableStateOf(initialPdfUri) }
    var activeName by remember { mutableStateOf(initialFileName ?: "PDF Document") }
    var selectedIndices by remember { mutableStateOf<Set<Int>>(emptySet()) }

    BackHandler(onBack = onBack)

    LaunchedEffect(activePdfUri) {
        activePdfUri?.let {
            selectedIndices = emptySet()
            toolsViewModel.loadOrganizerPages(it)
        }
    }

    val mergeLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val primary = activePdfUri
        if (uri != null && primary != null) {
            toolsViewModel.mergeAnotherPdf(primary, uri)
        }
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
                    Text("PDF Page Organizer", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text(activeName, style = MaterialTheme.typography.bodyMedium, color = palette.muted, maxLines = 1)
                }
                if (activePdfUri != null) {
                    OutlinedButton(onClick = { mergeLauncher.launch(arrayOf("application/pdf")) }) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Merge PDF")
                    }
                }
            }
        }

        Column(modifier = Modifier.widthIn(max = 600.dp).fillMaxSize()) {
            if (isBusy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            if (activePdfUri == null) {
                val pdfOnly = remember(allPdfs) { allPdfs.filter { it.extension.equals("pdf", true) } }
                if (pdfOnly.isEmpty()) {
                    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
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
                                    .clickable {
                                        activePdfUri = doc.uri
                                        activeName = doc.name
                                    }
                            ) {
                                Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = palette.danger)
                                    Spacer(Modifier.width(12.dp))
                                    Column {
                                        Text(doc.name, style = MaterialTheme.typography.titleMedium, color = palette.text)
                                        Text("${doc.pageCount} pages", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    itemsIndexed(pages) { idx, imgPath ->
                        val isSel = idx in selectedIndices
                        Box(
                            modifier = Modifier
                                .height(155.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .border(
                                    width = if (isSel) 2.5.dp else 1.dp,
                                    color = if (isSel) palette.accent else palette.border,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .clickable {
                                    selectedIndices = if (isSel) selectedIndices - idx else selectedIndices + idx
                                }
                                .testTag("organizer_page_$idx")
                        ) {
                            AsyncImage(
                                model = File(imgPath),
                                contentDescription = "Page ${idx + 1}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                            Surface(
                                color = Color.Black.copy(alpha = 0.72f),
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier.align(Alignment.BottomStart).padding(6.dp)
                            ) {
                                Text("Page ${idx + 1}", color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                            if (isSel) {
                                Icon(
                                    Icons.Rounded.CheckCircle,
                                    contentDescription = "Selected",
                                    tint = palette.accent,
                                    modifier = Modifier.align(Alignment.TopEnd).padding(6.dp)
                                )
                            }
                        }
                    }
                }

                // Page Actions Bar
                val uri = activePdfUri!!
                Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val singleIdx = selectedIndices.singleOrNull()
                        FilledTonalButton(
                            enabled = selectedIndices.isNotEmpty() && !isBusy,
                            onClick = { toolsViewModel.rotateOrganizerPages(uri, selectedIndices, 90) }
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Rotate")
                        }
                        if (singleIdx != null) {
                            OutlinedButton(
                                enabled = singleIdx > 0 && !isBusy,
                                onClick = {
                                    toolsViewModel.moveOrganizerPage(uri, singleIdx, singleIdx - 1)
                                    selectedIndices = setOf(singleIdx - 1)
                                }
                            ) {
                                Icon(Icons.Rounded.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Earlier")
                            }
                            OutlinedButton(
                                enabled = singleIdx < pages.lastIndex && !isBusy,
                                onClick = {
                                    toolsViewModel.moveOrganizerPage(uri, singleIdx, singleIdx + 1)
                                    selectedIndices = setOf(singleIdx + 1)
                                }
                            ) {
                                Text("Later")
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Rounded.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
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
                                toolsViewModel.deleteOrganizerPages(uri, selectedIndices)
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
}
