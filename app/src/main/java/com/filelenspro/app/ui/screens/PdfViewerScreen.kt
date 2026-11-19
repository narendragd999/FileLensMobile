package com.filelenspro.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Draw
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.WaterDrop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.filelenspro.app.ui.components.DocumentSignatureDialog
import com.filelenspro.app.ui.components.DocumentWatermarkDialog
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.filelenspro.app.util.FormatUtils
import java.io.File

@Composable
fun PdfViewerScreen(
    uri: String,
    title: String,
    toolsViewModel: ToolsViewModel,
    onOpenOrganizer: (currentUri: String) -> Unit,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val allFiles by toolsViewModel.allFiles.collectAsState()
    val savedSignatures by toolsViewModel.savedSignatures.collectAsState()

    var activeUri by remember { mutableStateOf(uri) }
    var pages by remember { mutableStateOf<List<String>>(emptyList()) }
    var currentIndex by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var isRotating by remember { mutableStateOf(false) }
    var refreshNonce by remember { mutableIntStateOf(0) }
    var showFindBar by remember { mutableStateOf(false) }
    var findQuery by remember { mutableStateOf("") }
    var showWatermark by remember { mutableStateOf(false) }
    var showSignature by remember { mutableStateOf(false) }

    var zoomScale by remember(currentIndex, activeUri) { mutableFloatStateOf(1f) }
    var panOffset by remember(currentIndex, activeUri) { mutableStateOf(Offset.Zero) }

    val matchingDoc = remember(allFiles, activeUri) { allFiles.firstOrNull { it.uri == activeUri } }
    val matchingPageIndices = remember(matchingDoc, findQuery) {
        val q = findQuery.trim()
        val text = listOfNotNull(matchingDoc?.ocrText, matchingDoc?.contentText).joinToString("\n")
        if (q.isBlank() || text.isBlank()) {
            emptyList()
        } else {
            val regex = Regex("\\[Page (\\d+)](.*?)(?=\\[Page \\d+]|$)", setOf(RegexOption.DOT_MATCHES_ALL))
            val hits = regex.findAll(text).mapNotNull { m ->
                val pageNum = m.groupValues[1].toIntOrNull() ?: return@mapNotNull null
                if (m.groupValues[2].contains(q, ignoreCase = true)) (pageNum - 1).coerceAtLeast(0) else null
            }.distinct().toList()
            if (hits.isEmpty() && text.contains(q, ignoreCase = true)) listOf(0) else hits
        }
    }

    BackHandler(onBack = onBack)

    // Automatically re-renders when returning from Page Organizer or after rotating/editing
    LaunchedEffect(activeUri, matchingDoc?.modified, matchingDoc?.size, refreshNonce) {
        loading = true
        pages = toolsViewModel.engine.renderPdfToImages(
            uriString = activeUri,
            limit = 80,
            maxDim = 1600,
            forceRefresh = refreshNonce > 0
        )
        currentIndex = currentIndex.coerceIn(0, (pages.size - 1).coerceAtLeast(0))
        loading = false
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
                    .padding(horizontal = 4.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = palette.text)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, color = palette.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        if (pages.isNotEmpty()) "Page ${currentIndex + 1} of ${pages.size}${if (zoomScale > 1.05f) " · ${"%.1f".format(zoomScale)}x" else ""}" else "Loading PDF…",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.muted
                    )
                }
                IconButton(
                    enabled = pages.isNotEmpty() && !isRotating && !loading,
                    onClick = {
                        isRotating = true
                        toolsViewModel.rotatePdfSinglePage(activeUri, currentIndex, 90) { updatedUri ->
                            if (updatedUri != null) {
                                activeUri = updatedUri
                                refreshNonce++
                            }
                            isRotating = false
                        }
                    },
                    modifier = Modifier
                        .size(42.dp)
                        .testTag("pdf_quick_rotate_btn")
                ) {
                    Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = "Rotate Current Page 90°", tint = palette.text)
                }
                IconButton(onClick = { showFindBar = !showFindBar }, modifier = Modifier.size(42.dp).testTag("pdf_find_btn")) {
                    Icon(Icons.Rounded.Search, contentDescription = "Find in PDF", tint = if (showFindBar) palette.accent else palette.text)
                }
                IconButton(onClick = { showWatermark = true }, modifier = Modifier.size(42.dp).testTag("pdf_watermark_btn")) {
                    Icon(Icons.Rounded.WaterDrop, contentDescription = "Watermark PDF", tint = palette.text)
                }
                IconButton(onClick = { showSignature = true }, modifier = Modifier.size(42.dp).testTag("pdf_sign_btn")) {
                    Icon(Icons.Rounded.Draw, contentDescription = "Sign PDF Page", tint = palette.text)
                }
                IconButton(onClick = { onOpenOrganizer(activeUri) }, modifier = Modifier.size(42.dp).testTag("pdf_organize_btn")) {
                    Icon(Icons.Rounded.Layers, contentDescription = "Organize PDF Pages", tint = palette.accent)
                }
                IconButton(onClick = { FormatUtils.shareFileOrText(context, activeUri, title, title) }, modifier = Modifier.size(42.dp)) {
                    Icon(Icons.Rounded.Share, contentDescription = "Share PDF", tint = palette.text)
                }
            }
        }

        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
        ) {
            if (showFindBar) {
                Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(
                            value = findQuery,
                            onValueChange = { findQuery = it },
                            placeholder = { Text("Search inside PDF OCR text…") },
                            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.accent) },
                            trailingIcon = {
                                if (findQuery.isNotBlank()) {
                                    IconButton(onClick = { findQuery = "" }) {
                                        Icon(Icons.Rounded.Close, contentDescription = "Clear Find")
                                    }
                                }
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("pdf_find_input")
                        )
                        if (findQuery.isNotBlank()) {
                            if (matchingPageIndices.isEmpty()) {
                                Text("No matches found in indexed OCR text.", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                            } else {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Jump to match:", style = MaterialTheme.typography.labelSmall, color = palette.accent)
                                    matchingPageIndices.forEach { pg ->
                                        AssistChip(
                                            onClick = { currentIndex = pg.coerceIn(0, (pages.size - 1).coerceAtLeast(0)) },
                                            label = { Text("Page ${pg + 1}") }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (loading || isRotating) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            if (pages.isEmpty() && !loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Unable to render PDF pages.", color = palette.muted)
                }
            } else if (pages.isNotEmpty()) {
                val pagePath = pages[currentIndex.coerceIn(0, pages.lastIndex)]
                val pageReq = remember(pagePath) {
                    ImageRequest.Builder(context)
                        .data(File(pagePath))
                        .memoryCacheKey(pagePath)
                        .diskCacheKey(pagePath)
                        .build()
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(0.dp))
                        .pointerInput(currentIndex, activeUri) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val nextScale = (zoomScale * zoom).coerceIn(1f, 4f)
                                zoomScale = nextScale
                                panOffset = if (nextScale > 1f) panOffset + pan else Offset.Zero
                            }
                        }
                        .pointerInput(currentIndex, activeUri) {
                            detectTapGestures(onDoubleTap = {
                                zoomScale = if (zoomScale > 1.2f) 1f else 2.2f
                                panOffset = Offset.Zero
                            })
                        },
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        model = pageReq,
                        contentDescription = "PDF Page ${currentIndex + 1}",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(10.dp)
                            .graphicsLayer(
                                scaleX = zoomScale,
                                scaleY = zoomScale,
                                translationX = panOffset.x,
                                translationY = panOffset.y
                            )
                    )
                }
                if (pages.size > 1) {
                    Surface(color = palette.surface, modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier
                                .navigationBarsPadding()
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Page ${currentIndex + 1}", style = MaterialTheme.typography.labelLarge, color = palette.text)
                                Text("Pinch/double-tap zoom · ${pages.size} total", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                            }
                            Slider(
                                value = currentIndex.toFloat(),
                                onValueChange = { currentIndex = it.toInt() },
                                valueRange = 0f..(pages.lastIndex).toFloat(),
                                steps = (pages.size - 2).coerceAtLeast(0)
                            )
                        }
                    }
                }
            }
        }
    }

    if (showWatermark) {
        DocumentWatermarkDialog(
            onDismiss = { showWatermark = false },
            onApply = { txt, col, alpha ->
                showWatermark = false
                toolsViewModel.applyPdfWatermarkByUri(activeUri, title, txt, col, alpha) { newUri ->
                    activeUri = newUri
                    refreshNonce++
                }
            }
        )
    }

    if (showSignature) {
        DocumentSignatureDialog(
            onDismiss = { showSignature = false },
            onApply = { bmp ->
                showSignature = false
                toolsViewModel.applyPdfSignatureByUri(activeUri, title, currentIndex, bmp) { newUri ->
                    activeUri = newUri
                    refreshNonce++
                }
            },
            savedSignatures = savedSignatures,
            onSaveSignatureForReuse = { toolsViewModel.saveSignatureForReuse(it) },
            onDeleteSavedSignature = { toolsViewModel.deleteSavedSignature(it) },
            onApplyWithPlacement = { bmp, placement ->
                showSignature = false
                toolsViewModel.applyPdfSignatureByUri(activeUri, title, currentIndex, bmp, placement) { newUri ->
                    activeUri = newUri
                    refreshNonce++
                }
            }
        )
    }
}
