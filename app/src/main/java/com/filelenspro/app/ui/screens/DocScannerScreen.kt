package com.filelenspro.app.ui.screens

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Crop
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.TextSnippet
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.data.model.PdfPageSizePreset
import com.filelenspro.app.data.model.PdfQualityPreset
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.ui.components.LiveDocumentCameraView
import com.filelenspro.app.ui.components.PerspectiveCropDialog
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import kotlinx.coroutines.launch

private data class ScannedPageItem(
    val uri: Uri,
    val rotationDeg: Int = 0,
    val filter: String = "magic", // magic | bw | whiteboard | grayscale | original
    val quad: NormalizedQuad = NormalizedQuad.FULL
)

private val SCAN_FILTERS = listOf(
    "magic" to "Magic Color",
    "bw" to "B&W Clean",
    "whiteboard" to "Whiteboard",
    "grayscale" to "Grayscale",
    "original" to "Photo"
)

@Composable
fun DocScannerScreen(
    initialMode: String,
    appendToPdfUri: String? = null,
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val isSavingPdf by toolsViewModel.isSavingPdf.collectAsState()
    val userPrefs by toolsViewModel.userPrefs.collectAsState()

    val isAppendMode = !appendToPdfUri.isNullOrBlank()
    var scanMode by remember { mutableStateOf(if (isAppendMode) "batch" else initialMode) }
    var docTitle by remember {
        mutableStateOf(
            if (initialMode == "idcard") "ID_Card_${System.currentTimeMillis() % 10000}"
            else "Scan_${System.currentTimeMillis() % 10000}"
        )
    }
    var isSmartNaming by remember { mutableStateOf(false) }
    var saveAsSmartCard by remember { mutableStateOf(initialMode == "idcard") }
    var idTag by remember { mutableStateOf("ID Card") }
    var activeGlobalFilter by remember { mutableStateOf("magic") }
    var pageSizePreset by remember { mutableStateOf(PdfPageSizePreset.AUTO) }
    var qualityPreset by remember { mutableStateOf(PdfQualityPreset.BALANCED) }
    var protectWithPassword by remember { mutableStateOf(false) }
    var pdfPassword by remember { mutableStateOf("") }
    var embedOcrTextLayer by remember(userPrefs.searchablePdfOcrLayer) { mutableStateOf(userPrefs.searchablePdfOcrLayer) }
    var showExportOptions by remember { mutableStateOf(false) }

    var scannedPages by remember { mutableStateOf<List<ScannedPageItem>>(emptyList()) }
    var cropEditingIndex by remember { mutableIntStateOf(-1) }

    val hasCameraPermissionInit = remember {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }
    // Start directly inside the zero-latency live CameraX scanner when camera permission is granted!
    var showLiveCamera by remember { mutableStateOf(hasCameraPermissionInit) }

    BackHandler {
        if (showLiveCamera && scannedPages.isNotEmpty()) {
            showLiveCamera = false
        } else {
            onBack()
        }
    }

    val scannerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
            val pages = scanResult?.pages?.map { ScannedPageItem(it.imageUri, 0, activeGlobalFilter, NormalizedQuad.FULL) } ?: emptyList()
            if (pages.isNotEmpty()) {
                scannedPages = if (scanMode == "single") listOf(pages.last()) else scannedPages + pages
                showLiveCamera = false
                toolsViewModel.postToast("Captured ${pages.size} crisp page(s)")
            }
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            showLiveCamera = true
        } else {
            toolsViewModel.postToast("Camera permission denied. Use Photos Picker instead.")
        }
    }

    val galleryFallbackLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(30)) { uris ->
        if (uris.isNotEmpty()) {
            val newItems = uris.map { ScannedPageItem(it, 0, activeGlobalFilter, NormalizedQuad.FULL) }
            val startIdx = if (scanMode == "single") 0 else scannedPages.size
            scannedPages = if (scanMode == "single") listOf(newItems.first()) else scannedPages + newItems
            showLiveCamera = false
            toolsViewModel.postToast("Added ${uris.size} page(s) · Auto-detecting edges…")
            // Run fast background auto-edge detection on imported photos
            scope.launch {
                val targetList = if (scanMode == "single") listOf(newItems.first()) else newItems
                targetList.forEachIndexed { offset, pageItem ->
                    val detected = toolsViewModel.engine.detectDocumentQuadForUri(pageItem.uri.toString())
                    val targetIdx = startIdx + offset
                    scannedPages = scannedPages.mapIndexed { idx, cur ->
                        if (idx == targetIdx && cur.uri == pageItem.uri) cur.copy(quad = detected) else cur
                    }
                }
                if (scanMode == "single" && scannedPages.isNotEmpty()) {
                    cropEditingIndex = 0
                }
            }
        }
    }

    fun openInstantLiveScanner() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            showLiveCamera = true
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    fun launchMlKitScanner() {
        if (activity == null) return
        val limit = when (scanMode) {
            "idcard" -> 2
            "single" -> 1
            else -> 50
        }
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(limit)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG, GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(activity)
            .addOnSuccessListener { intentSender ->
                scannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener {
                toolsViewModel.postToast("Google AI scanner unavailable — using Instant Live Scanner")
                openInstantLiveScanner()
            }
    }

    // ─── Full-Screen Zero-Latency Live CameraX Scanner ───
    if (showLiveCamera) {
        LiveDocumentCameraView(
            scanMode = scanMode,
            isAppendMode = isAppendMode,
            capturedCount = scannedPages.size,
            lastCapturedUri = scannedPages.lastOrNull()?.uri,
            onScanModeChange = { next ->
                scanMode = next
                if (next == "idcard") saveAsSmartCard = true
            },
            onCapturedPage = { uri, detectedQuad ->
                val newItem = ScannedPageItem(
                    uri = uri,
                    rotationDeg = 0,
                    filter = activeGlobalFilter,
                    quad = detectedQuad
                )
                val targetIdx = if (scanMode == "single") 0 else scannedPages.size
                scannedPages = if (scanMode == "single") {
                    listOf(newItem)
                } else {
                    scannedPages + newItem
                }
                // Refine edges with full RGB desk-color detection if live luma returned full frame
                if (detectedQuad.isFullFrame()) {
                    scope.launch {
                        val refined = toolsViewModel.engine.detectDocumentQuadForUri(uri.toString())
                        if (!refined.isFullFrame()) {
                            scannedPages = scannedPages.mapIndexed { idx, cur ->
                                if (idx == targetIdx && cur.uri == uri && cur.quad.isFullFrame()) cur.copy(quad = refined) else cur
                            }
                        }
                    }
                }
                if (scanMode == "single") {
                    showLiveCamera = false
                    cropEditingIndex = 0
                } else if (scanMode == "idcard" && scannedPages.size >= 2) {
                    showLiveCamera = false
                    toolsViewModel.postToast("Front & Back captured — tap either card to fine-tune corners!")
                }
            },
            onOpenGallery = {
                galleryFallbackLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            },
            onOpenMlKitFallback = {
                launchMlKitScanner()
            },
            onOpenReviewStudio = {
                showLiveCamera = false
            },
            onClose = {
                if (scannedPages.isNotEmpty()) {
                    showLiveCamera = false
                } else {
                    onBack()
                }
            },
            onError = { msg -> toolsViewModel.postToast(msg) }
        )
        return
    }

    // ─── Perspective Crop Modal Dialog ───
    if (cropEditingIndex in scannedPages.indices) {
        val editing = scannedPages[cropEditingIndex]
        PerspectiveCropDialog(
            imageUri = editing.uri,
            pageLabel = if (scanMode == "idcard") (if (cropEditingIndex == 0) "Front" else "Back") else "Page ${cropEditingIndex + 1}",
            initialQuad = editing.quad,
            initialRotationDeg = editing.rotationDeg,
            initialFilter = editing.filter,
            engine = toolsViewModel.engine,
            onDismiss = { cropEditingIndex = -1 },
            onApply = { updatedQuad, updatedRot, updatedFilter ->
                val idx = cropEditingIndex
                scannedPages = scannedPages.mapIndexed { i, p ->
                    if (i == idx) p.copy(quad = updatedQuad, rotationDeg = updatedRot, filter = updatedFilter) else p
                }
                cropEditingIndex = -1
                toolsViewModel.postToast("Perspective straightening applied")
            }
        )
    }

    // ─── Review, Enhance & Export Studio ───
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
                    Text(
                        if (isAppendMode) "Scan & Append Pages" else "Instant Scan Studio",
                        style = MaterialTheme.typography.titleLarge,
                        color = palette.text,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        if (isAppendMode) "Appends directly to selected PDF" else "Auto-Edge · Shadow-Free B&W · Perspective · PDF Lock",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                FilledTonalButton(
                    onClick = { openInstantLiveScanner() },
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.testTag("scanner_open_live_btn")
                ) {
                    Icon(Icons.Rounded.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(if (scannedPages.isEmpty()) "Live Scan" else "+ Scan", style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        if (isSavingPdf) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (!isAppendMode) {
                // Mode Chips
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = scanMode == "batch",
                        onClick = { scanMode = "batch" },
                        label = { Text("Multi-Page Batch") },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                    )
                    FilterChip(
                        selected = scanMode == "single",
                        onClick = { scanMode = "single" },
                        label = { Text("Single Page") },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                    )
                    FilterChip(
                        selected = scanMode == "idcard",
                        onClick = {
                            scanMode = "idcard"
                            saveAsSmartCard = true
                        },
                        leadingIcon = { Icon(Icons.Rounded.Badge, contentDescription = null, modifier = Modifier.size(16.dp)) },
                        label = { Text("2-in-1 A4 ID") },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = palette.accent, selectedLabelColor = Color.White)
                    )
                }

                // Document Title + One-Tap AI Smart Auto-Naming
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = docTitle,
                        onValueChange = { docTitle = it },
                        label = { Text("Document Title") },
                        singleLine = true,
                        modifier = Modifier.weight(1f).testTag("scanner_title_input")
                    )
                    FilledTonalButton(
                        enabled = scannedPages.isNotEmpty() && !isSmartNaming,
                        onClick = {
                            val first = scannedPages.firstOrNull()?.uri ?: return@FilledTonalButton
                            isSmartNaming = true
                            toolsViewModel.suggestSmartScanTitle(first) { suggested ->
                                docTitle = suggested
                                isSmartNaming = false
                            }
                        },
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 14.dp),
                        modifier = Modifier.testTag("scanner_smart_name_btn")
                    ) {
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = "Smart Auto-Name", modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(if (isSmartNaming) "…" else "Smart")
                    }
                }

                // Compact Expandable PDF Export Options (Page Size, Quality, AES-128 Password, Smart Card)
                Surface(
                    color = palette.surface,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                ) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showExportOptions = !showExportOptions }
                                .padding(vertical = 4.dp)
                                .testTag("scanner_export_options_toggle"),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Rounded.Tune, contentDescription = null, tint = palette.accent, modifier = Modifier.size(18.dp))
                                Text(
                                    text = "${pageSizePreset.label} · ${qualityPreset.label}" +
                                        (if (embedOcrTextLayer && scanMode != "idcard") " · Searchable OCR" else "") +
                                        (if (protectWithPassword && pdfPassword.isNotBlank()) " · Locked" else "") +
                                        (if (saveAsSmartCard) " · Card" else ""),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = palette.text,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            Icon(
                                if (showExportOptions) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
                                contentDescription = "Toggle Export Options",
                                tint = palette.muted
                            )
                        }

                        AnimatedVisibility(visible = showExportOptions) {
                            Column(
                                modifier = Modifier.padding(top = 8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                // Page Size
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text("Page:", style = MaterialTheme.typography.labelMedium, color = palette.muted)
                                    PdfPageSizePreset.entries.forEach { preset ->
                                        FilterChip(
                                            selected = pageSizePreset == preset,
                                            onClick = { pageSizePreset = preset },
                                            label = { Text(preset.label) }
                                        )
                                    }
                                }
                                // Quality
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text("Size:", style = MaterialTheme.typography.labelMedium, color = palette.muted)
                                    PdfQualityPreset.entries.forEach { q ->
                                        FilterChip(
                                            selected = qualityPreset == q,
                                            onClick = { qualityPreset = q },
                                            label = { Text(q.label) }
                                        )
                                    }
                                }
                                // True Searchable PDF (Embedded Invisible OCR Text Layer) + Password Lock
                                if (scanMode != "idcard") {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                                            Icon(Icons.Rounded.TextSnippet, contentDescription = null, tint = palette.success, modifier = Modifier.size(18.dp))
                                            Column {
                                                Text("Searchable PDF (Invisible OCR Layer)", style = MaterialTheme.typography.bodyMedium, color = palette.text)
                                                Text("Selectable & Ctrl+F searchable in any external PDF reader", style = MaterialTheme.typography.labelSmall, color = palette.muted)
                                            }
                                        }
                                        Switch(
                                            checked = embedOcrTextLayer,
                                            onCheckedChange = {
                                                embedOcrTextLayer = it
                                                toolsViewModel.setSearchablePdfOcrLayer(it)
                                            },
                                            modifier = Modifier.testTag("scanner_searchable_ocr_switch")
                                        )
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Icon(Icons.Rounded.Lock, contentDescription = null, tint = palette.warning, modifier = Modifier.size(18.dp))
                                            Text("Password-Protect PDF (AES-128)", style = MaterialTheme.typography.bodyMedium, color = palette.text)
                                        }
                                        Switch(
                                            checked = protectWithPassword,
                                            onCheckedChange = { protectWithPassword = it },
                                            modifier = Modifier.testTag("scanner_password_switch")
                                        )
                                    }
                                    if (protectWithPassword) {
                                        OutlinedTextField(
                                            value = pdfPassword,
                                            onValueChange = { pdfPassword = it },
                                            label = { Text("PDF Open Password") },
                                            singleLine = true,
                                            visualTransformation = PasswordVisualTransformation(),
                                            modifier = Modifier.fillMaxWidth().testTag("scanner_password_input")
                                        )
                                    }
                                    // Smart Cards Wallet toggle
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Icon(Icons.Rounded.CreditCard, contentDescription = null, tint = palette.accent, modifier = Modifier.size(18.dp))
                                            Text("Also save to Smart Cards Wallet", style = MaterialTheme.typography.bodyMedium, color = palette.text)
                                        }
                                        Switch(checked = saveAsSmartCard, onCheckedChange = { saveAsSmartCard = it })
                                    }
                                }
                                if (saveAsSmartCard || scanMode == "idcard") {
                                    Row(
                                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        SmartTaxonomy.QUICK_CARD_TAGS.take(8).forEach { tag ->
                                            FilterChip(selected = idTag == tag, onClick = { idTag = tag }, label = { Text(tag) })
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Surface(
                    color = palette.accent.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        "Capture pages instantly in Live Scan or pick from Photos — they will be perspective-corrected, filtered, and appended directly to your PDF.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.accent,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            // Capture Controls Row
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = { openInstantLiveScanner() },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                    modifier = Modifier.weight(1.3f).testTag("scanner_direct_camera_btn")
                ) {
                    Icon(Icons.Rounded.CameraAlt, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Live Scan")
                }
                OutlinedButton(
                    onClick = {
                        galleryFallbackLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    },
                    modifier = Modifier.weight(1f).testTag("scanner_pick_photos_btn")
                ) {
                    Icon(Icons.Rounded.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Photos")
                }
                OutlinedButton(
                    onClick = { launchMlKitScanner() },
                    modifier = Modifier.weight(0.95f).testTag("scanner_launch_mlkit_btn")
                ) {
                    Icon(Icons.Rounded.DocumentScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("AI Scan")
                }
            }

            if (scannedPages.isEmpty()) {
                Surface(
                    color = palette.surface,
                    shape = RoundedCornerShape(18.dp),
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Rounded.DocumentScanner, contentDescription = null, tint = palette.accent, modifier = Modifier.size(54.dp))
                        Spacer(Modifier.height(12.dp))
                        Text(
                            if (scanMode == "idcard") "2-in-1 A4 ID Card Scanner" else "Instant Burst Document Scanner",
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.text,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (scanMode == "idcard")
                                "Tap Live Scan to capture Front & Back with guided framing and auto perspective straightening onto a single A4 PDF."
                            else
                                "Zero-lag continuous batch scanning with real-time edge tracking, hands-free auto-capture, shadow-free B&W, perspective crop & AES-128 PDF password lock.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted
                        )
                    }
                }
            } else {
                // Global Filter Strip
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text("Filter:", style = MaterialTheme.typography.labelLarge, color = palette.muted)
                    SCAN_FILTERS.forEach { (id, label) ->
                        FilterChip(
                            selected = activeGlobalFilter == id,
                            onClick = {
                                activeGlobalFilter = id
                                scannedPages = scannedPages.map { it.copy(filter = id) }
                            },
                            label = { Text(label) }
                        )
                    }
                }

                // Captured Pages Grid
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(2.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    itemsIndexed(scannedPages) { idx, item ->
                        val previewFilter = remember(item.filter) { colorFilterForScanMode(item.filter) }
                        val hasCustomCrop = !item.quad.isFullFrame()
                        Surface(
                            color = palette.surface,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.border(1.dp, palette.border, RoundedCornerShape(14.dp))
                        ) {
                            Column {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(148.dp)
                                        .clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp))
                                        .background(Color.Black.copy(alpha = 0.08f))
                                        .clickable { cropEditingIndex = idx }
                                ) {
                                    ScannedPagePreviewImage(
                                        item = item,
                                        previewFilter = previewFilter,
                                        engine = toolsViewModel.engine,
                                        contentDescription = "Scanned page ${idx + 1}",
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(6.dp)
                                    )
                                    // Top-left Page / Front-Back Badge + Straightened pill
                                    Row(
                                        modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Surface(
                                            color = Color.Black.copy(alpha = 0.72f),
                                            shape = RoundedCornerShape(6.dp)
                                        ) {
                                            Text(
                                                if (scanMode == "idcard") (if (idx == 0) "FRONT" else "BACK") else "P${idx + 1}",
                                                color = Color.White,
                                                style = MaterialTheme.typography.labelSmall,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                        if (hasCustomCrop) {
                                            Surface(
                                                color = palette.success.copy(alpha = 0.92f),
                                                shape = RoundedCornerShape(6.dp)
                                            ) {
                                                Text(
                                                    "Straightened",
                                                    color = Color.White,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontWeight = FontWeight.SemiBold,
                                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                                )
                                            }
                                        }
                                    }
                                    // Bottom-left per-page filter cycler
                                    Surface(
                                        color = palette.accent.copy(alpha = 0.9f),
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier
                                            .align(Alignment.BottomStart)
                                            .padding(6.dp)
                                            .clickable {
                                                val order = SCAN_FILTERS.map { it.first }
                                                val next = order[(order.indexOf(item.filter) + 1) % order.size]
                                                scannedPages = scannedPages.mapIndexed { i, p -> if (i == idx) p.copy(filter = next) else p }
                                            }
                                    ) {
                                        Text(
                                            SCAN_FILTERS.firstOrNull { it.first == item.filter }?.second ?: "Magic",
                                            color = Color.White,
                                            style = MaterialTheme.typography.labelSmall,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                    // Top-right remove page with inline Undo toast
                                    IconButton(
                                        onClick = {
                                            val removed = item
                                            val removeAt = idx
                                            scannedPages = scannedPages.filterIndexed { i, _ -> i != idx }
                                            toolsViewModel.postToast(
                                                msg = "Removed page ${removeAt + 1}",
                                                actionLabel = "Undo"
                                            ) {
                                                val restored = scannedPages.toMutableList()
                                                restored.add(removeAt.coerceIn(0, restored.size), removed)
                                                scannedPages = restored
                                            }
                                        },
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(4.dp)
                                            .size(28.dp)
                                            .clip(CircleShape)
                                            .background(Color.Black.copy(alpha = 0.65f))
                                    ) {
                                        Icon(Icons.Rounded.Close, contentDescription = "Remove Page", tint = Color.White, modifier = Modifier.size(16.dp))
                                    }
                                }
                                // Per-Page Action Bar: Move Left · Perspective Crop · Rotate 90° · Move Right
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 2.dp),
                                    horizontalArrangement = Arrangement.SpaceEvenly,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    IconButton(
                                        enabled = idx > 0,
                                        onClick = {
                                            val list = scannedPages.toMutableList()
                                            val moved = list.removeAt(idx)
                                            list.add(idx - 1, moved)
                                            scannedPages = list
                                        },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, contentDescription = "Move Earlier", tint = if (idx > 0) palette.text else palette.dim)
                                    }
                                    IconButton(
                                        onClick = { cropEditingIndex = idx },
                                        modifier = Modifier.size(36.dp).testTag("scanner_crop_page_$idx")
                                    ) {
                                        Icon(Icons.Rounded.Crop, contentDescription = "Perspective Crop", tint = if (hasCustomCrop) palette.success else palette.accent)
                                    }
                                    IconButton(
                                        onClick = {
                                            scannedPages = scannedPages.mapIndexed { i, p ->
                                                if (i == idx) p.copy(rotationDeg = (p.rotationDeg + 90) % 360) else p
                                            }
                                        },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = "Rotate 90 Degrees", tint = palette.accent)
                                    }
                                    IconButton(
                                        enabled = idx < scannedPages.lastIndex,
                                        onClick = {
                                            val list = scannedPages.toMutableList()
                                            val moved = list.removeAt(idx)
                                            list.add(idx + 1, moved)
                                            scannedPages = list
                                        },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, contentDescription = "Move Later", tint = if (idx < scannedPages.lastIndex) palette.text else palette.dim)
                                    }
                                }
                            }
                        }
                    }
                }

                // Primary Export CTA
                Button(
                    enabled = !isSavingPdf,
                    onClick = {
                        val uris = scannedPages.map { it.uri }
                        val rots = scannedPages.map { it.rotationDeg }
                        val flts = scannedPages.map { it.filter }
                        val quads = scannedPages.map { it.quad }
                        val activePass = if (protectWithPassword && pdfPassword.isNotBlank()) pdfPassword else null
                        when {
                            isAppendMode -> {
                                toolsViewModel.appendScannedImagesToPdf(
                                    targetPdfUri = appendToPdfUri!!,
                                    imageUris = uris,
                                    rotations = rots,
                                    filters = flts,
                                    quads = quads
                                ) { ok -> if (ok) onBack() }
                            }
                            scanMode == "idcard" -> {
                                toolsViewModel.saveIdCard2In1Pdf(
                                    frontUri = uris.first(),
                                    backUri = uris.getOrNull(1),
                                    tag = idTag,
                                    title = docTitle,
                                    frontRotation = rots.getOrElse(0) { 0 },
                                    backRotation = rots.getOrElse(1) { 0 },
                                    frontFilter = flts.getOrElse(0) { "magic" },
                                    backFilter = flts.getOrElse(1) { "magic" },
                                    frontQuad = quads.getOrElse(0) { NormalizedQuad.FULL },
                                    backQuad = quads.getOrElse(1) { NormalizedQuad.FULL }
                                ) { onBack() }
                            }
                            else -> {
                                toolsViewModel.saveScannedImagesAsPdf(
                                    imageUris = uris,
                                    title = docTitle,
                                    isCard = saveAsSmartCard,
                                    cardTag = if (saveAsSmartCard) idTag else "",
                                    rotations = rots,
                                    filters = flts,
                                    quads = quads,
                                    pageSize = pageSizePreset,
                                    qualityPreset = qualityPreset,
                                    pdfPassword = activePass,
                                    embedOcrTextLayer = embedOcrTextLayer
                                ) { onBack() }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.success),
                    modifier = Modifier.fillMaxWidth().height(52.dp).testTag("scanner_save_pdf_btn")
                ) {
                    Icon(if (protectWithPassword && pdfPassword.isNotBlank()) Icons.Rounded.Lock else Icons.Rounded.Check, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        when {
                            isSavingPdf -> "Straightening & Building PDF…"
                            isAppendMode -> "Append ${scannedPages.size} Page(s) to PDF"
                            scanMode == "idcard" -> "Save 2-in-1 A4 ID PDF & Index"
                            else -> "Build ${scannedPages.size}-Page PDF & Auto-Index"
                        },
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

private fun colorFilterForScanMode(filter: String): ColorFilter? {
    return when (filter.lowercase()) {
        "grayscale" -> ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })
        "bw" -> {
            val gray = ColorMatrix().apply { setToSaturation(0f) }
            val contrast = ColorMatrix(
                floatArrayOf(
                    2.4f, 0f, 0f, 0f, -150f,
                    0f, 2.4f, 0f, 0f, -150f,
                    0f, 0f, 2.4f, 0f, -150f,
                    0f, 0f, 0f, 1f, 0f
                )
            )
            gray.timesAssign(contrast)
            ColorFilter.colorMatrix(gray)
        }
        "whiteboard" -> {
            val sat = ColorMatrix().apply { setToSaturation(1.38f) }
            val boost = ColorMatrix(
                floatArrayOf(
                    1.42f, 0f, 0f, 0f, -34f,
                    0f, 1.42f, 0f, 0f, -34f,
                    0f, 0f, 1.42f, 0f, -34f,
                    0f, 0f, 0f, 1f, 0f
                )
            )
            sat.timesAssign(boost)
            ColorFilter.colorMatrix(sat)
        }
        "magic", "color", "auto" -> {
            val sat = ColorMatrix().apply { setToSaturation(1.16f) }
            val contrast = ColorMatrix(
                floatArrayOf(
                    1.32f, 0f, 0f, 0f, -24f,
                    0f, 1.32f, 0f, 0f, -24f,
                    0f, 0f, 1.32f, 0f, -24f,
                    0f, 0f, 0f, 1f, 0f
                )
            )
            sat.timesAssign(contrast)
            ColorFilter.colorMatrix(sat)
        }
        else -> null
    }
}

/**
 * Renders the true Matrix.setPolyToPoly perspective-warped, filtered, and rotated thumbnail
 * for each scanned page in the Review Studio (falling back instantaneously to AsyncImage
 * during the ~20ms background render).
 */
@Composable
private fun ScannedPagePreviewImage(
    item: ScannedPageItem,
    previewFilter: ColorFilter?,
    engine: com.filelenspro.app.service.OcrAndPdfEngine,
    contentDescription: String,
    modifier: Modifier = Modifier
) {
    var warpedBitmap by remember(item.uri) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(item.uri, item.quad, item.filter, item.rotationDeg) {
        val rendered = engine.renderPagePreviewBitmap(
            uriString = item.uri.toString(),
            quad = item.quad,
            filter = item.filter,
            rotationDeg = item.rotationDeg,
            maxDim = 560
        )
        val old = warpedBitmap
        warpedBitmap = rendered
        if (old != null && old !== rendered && !old.isRecycled) {
            old.recycle()
        }
    }

    DisposableEffect(item.uri) {
        onDispose {
            warpedBitmap?.takeIf { !it.isRecycled }?.recycle()
        }
    }

    val bmp = warpedBitmap?.takeIf { !it.isRecycled }
    if (bmp != null) {
        Image(
            bitmap = bmp.asImageBitmap(),
            contentDescription = contentDescription,
            contentScale = ContentScale.Fit,
            modifier = modifier
        )
    } else {
        AsyncImage(
            model = item.uri,
            contentDescription = contentDescription,
            contentScale = ContentScale.Fit,
            colorFilter = previewFilter,
            modifier = modifier.rotate(item.rotationDeg.toFloat())
        )
    }
}
