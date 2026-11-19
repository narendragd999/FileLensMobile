package com.filelenspro.app.ui.screens

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.filelenspro.app.domain.engine.SmartTaxonomy
import com.filelenspro.app.ui.theme.LocalFileLensColors
import com.filelenspro.app.ui.viewmodel.ToolsViewModel
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

@Composable
fun DocScannerScreen(
    initialMode: String,
    toolsViewModel: ToolsViewModel,
    onBack: () -> Unit
) {
    val palette = LocalFileLensColors.current
    val context = LocalContext.current
    val activity = context as? Activity

    var scanMode by remember { mutableStateOf(initialMode) }
    var docTitle by remember { mutableStateOf(if (initialMode == "idcard") "ID_Card_${System.currentTimeMillis() % 10000}" else "Scan_${System.currentTimeMillis() % 10000}") }
    var idTag by remember { mutableStateOf("ID Card") }
    var scannedPages by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var directScannedPdfUri by remember { mutableStateOf<Uri?>(null) }

    BackHandler(onBack = onBack)

    val scannerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
            val pages = scanResult?.pages?.map { it.imageUri } ?: emptyList()
            if (pages.isNotEmpty()) {
                scannedPages = scannedPages + pages
            }
            scanResult?.pdf?.uri?.let { directScannedPdfUri = it }
            toolsViewModel.postToast("Captured ${pages.size} crisp page(s)")
        }
    }

    val galleryFallbackLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(30)) { uris ->
        if (uris.isNotEmpty()) {
            scannedPages = scannedPages + uris
            toolsViewModel.postToast("Added ${uris.size} page(s) from Photos")
        }
    }

    fun launchMlKitScanner() {
        if (activity == null) return
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(if (scanMode == "idcard") 2 else 50)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG, GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(activity)
            .addOnSuccessListener { intentSender ->
                scannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener {
                toolsViewModel.postToast("Camera scanner unavailable on this device — opening Photo Picker")
                galleryFallbackLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
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
                    Text("Fast PDF Scanner", style = MaterialTheme.typography.titleLarge, color = palette.text)
                    Text("Multi-Page · Auto-Crop · 2-in-1 ID Card", style = MaterialTheme.typography.bodyMedium, color = palette.muted)
                }
            }
        }

        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxSize()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = scanMode == "batch",
                    onClick = { scanMode = "batch" },
                    label = { Text("Multi-Page PDF") }
                )
                FilterChip(
                    selected = scanMode == "idcard",
                    onClick = { scanMode = "idcard" },
                    leadingIcon = { Icon(Icons.Rounded.Badge, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    label = { Text("2-in-1 A4 ID Card") }
                )
            }

            OutlinedTextField(
                value = docTitle,
                onValueChange = { docTitle = it },
                label = { Text("Output Document Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("scanner_title_input")
            )

            if (scanMode == "idcard") {
                Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SmartTaxonomy.QUICK_CARD_TAGS.take(6).forEach { tag ->
                        FilterChip(selected = idTag == tag, onClick = { idTag = tag }, label = { Text(tag) })
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = { launchMlKitScanner() },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                    modifier = Modifier.weight(1f).testTag("scanner_launch_mlkit_btn")
                ) {
                    Icon(Icons.Rounded.DocumentScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Camera Scan")
                }
                OutlinedButton(
                    onClick = {
                        galleryFallbackLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    },
                    modifier = Modifier.weight(1f).testTag("scanner_pick_photos_btn")
                ) {
                    Icon(Icons.Rounded.PhotoLibrary, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("From Photos")
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
                        Icon(Icons.Rounded.AutoFixHigh, contentDescription = null, tint = palette.accent, modifier = Modifier.size(52.dp))
                        Spacer(Modifier.height(10.dp))
                        Text(
                            if (scanMode == "idcard") "Capture Front & Back of ID Card" else "Fast Multi-Page Document Scan",
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.text
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            if (scanMode == "idcard")
                                "Select or scan 2 pages (front + back) to composite them neatly onto a single printable A4 PDF + auto OCR."
                            else
                                "Scan up to 50 pages with auto-perspective correction, clean shadow removal, and instant parallel ML Kit OCR indexing.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.muted
                        )
                    }
                }
            } else {
                Text("Captured Pages (${scannedPages.size})", style = MaterialTheme.typography.titleMedium, color = palette.text)
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    itemsIndexed(scannedPages) { idx, uri ->
                        Box(
                            modifier = Modifier
                                .height(135.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                        ) {
                            AsyncImage(
                                model = uri,
                                contentDescription = "Scanned page ${idx + 1}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                            Surface(
                                color = Color.Black.copy(alpha = 0.7f),
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier.align(Alignment.BottomStart).padding(6.dp)
                            ) {
                                Text("P${idx + 1}", color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                            IconButton(
                                onClick = { scannedPages = scannedPages.filterIndexed { i, _ -> i != idx } },
                                modifier = Modifier.align(Alignment.TopEnd).size(30.dp)
                            ) {
                                Icon(Icons.Rounded.Close, contentDescription = "Remove Page", tint = Color.White)
                            }
                        }
                    }
                }

                Button(
                    onClick = {
                        if (scanMode == "idcard") {
                            toolsViewModel.saveIdCard2In1Pdf(
                                frontUri = scannedPages.first(),
                                backUri = scannedPages.getOrNull(1),
                                tag = idTag,
                                title = docTitle
                            ) { onBack() }
                        } else {
                            toolsViewModel.saveScannedImagesAsPdf(
                                imageUris = scannedPages,
                                title = docTitle,
                                isCard = false
                            ) { onBack() }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.success),
                    modifier = Modifier.fillMaxWidth().height(52.dp).testTag("scanner_save_pdf_btn")
                ) {
                    Icon(Icons.Rounded.Check, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (scanMode == "idcard") "Save 2-in-1 A4 ID PDF & Index" else "Build Multi-Page PDF & Auto-Index")
                }
            }
        }
    }
}
