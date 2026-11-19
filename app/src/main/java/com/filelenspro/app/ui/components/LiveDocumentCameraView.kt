package com.filelenspro.app.ui.components

import android.net.Uri
import android.view.MotionEvent
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DocumentScanner
import androidx.compose.material.icons.rounded.FlashAuto
import androidx.compose.material.icons.rounded.FlashOff
import androidx.compose.material.icons.rounded.FlashOn
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.GridOff
import androidx.compose.material.icons.rounded.GridOn
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil.compose.AsyncImage
import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.domain.engine.DocumentEdgeDetector
import kotlinx.coroutines.delay
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

private enum class FlashState { OFF, AUTO, ON, TORCH }

/**
 * Genius Scan iOS–class zero-latency CameraX Document Scanner:
 * - Instant CAPTURE_MODE_MINIMIZE_LATENCY shutter (<250ms burst capture, zero modal lag)
 * - Real-time Y-plane luma document edge detection with smooth animated quadrilateral overlay
 * - Hands-Free Auto-Capture when document is held steady (~650ms lock) with stability ring + cooldown
 * - Batch, Single, and guided 2-in-1 ID Card modes
 * - Flash / Continuous Torch, Grid, Tap-to-Focus, Gallery Photos, and optional Google AI Scan fallback
 */
@Composable
fun LiveDocumentCameraView(
    scanMode: String,
    isAppendMode: Boolean,
    capturedCount: Int,
    lastCapturedUri: Uri?,
    onScanModeChange: (String) -> Unit,
    onCapturedPage: (Uri, NormalizedQuad) -> Unit,
    onOpenGallery: () -> Unit,
    onOpenMlKitFallback: () -> Unit,
    onOpenReviewStudio: () -> Unit,
    onClose: () -> Unit,
    onError: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val haptics = LocalHapticFeedback.current

    var flashState by remember { mutableStateOf(FlashState.OFF) }
    var showGrid by remember { mutableStateOf(false) }
    var autoCaptureEnabled by remember { mutableStateOf(true) }
    var detectedQuad by remember { mutableStateOf<NormalizedQuad?>(null) }
    var stabilityProgress by remember { mutableFloatStateOf(0f) }
    var showShutterFlash by remember { mutableStateOf(false) }
    var isCapturing by remember { mutableStateOf(false) }
    var cameraError by remember { mutableStateOf<String?>(null) }
    var boundCamera by remember { mutableStateOf<Camera?>(null) }
    var imageCaptureUseCase by remember { mutableStateOf<ImageCapture?>(null) }
    var flashPulseKey by remember { mutableIntStateOf(0) }

    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val captureInFlight = remember { AtomicBoolean(false) }
    val lastAutoShotMs = remember { AtomicLong(0L) }

    val latestAutoEnabled by rememberUpdatedState(autoCaptureEnabled)
    val latestScanMode by rememberUpdatedState(scanMode)
    val latestCapturedCount by rememberUpdatedState(capturedCount)
    val latestDetectedQuad by rememberUpdatedState(detectedQuad)
    val latestOnCaptured by rememberUpdatedState(onCapturedPage)

    DisposableEffect(Unit) {
        onDispose {
            analysisExecutor.shutdown()
        }
    }

    LaunchedEffect(flashPulseKey) {
        if (flashPulseKey > 0) {
            showShutterFlash = true
            delay(110)
            showShutterFlash = false
        }
    }

    fun triggerInstantCapture(quadSnapshot: NormalizedQuad?) {
        val ic = imageCaptureUseCase ?: return
        if (!captureInFlight.compareAndSet(false, true)) return
        isCapturing = true
        flashPulseKey++
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)

        val dir = File(context.cacheDir, "camera_scans").apply { mkdirs() }
        val photoFile = File(dir, "genius_scan_${System.currentTimeMillis()}.jpg")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

        ic.takePicture(
            outputOptions,
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    val uri = runCatching {
                        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photoFile)
                    }.getOrElse { Uri.fromFile(photoFile) }
                    lastAutoShotMs.set(System.currentTimeMillis())
                    stabilityProgress = 0f
                    isCapturing = false
                    captureInFlight.set(false)
                    latestOnCaptured(uri, quadSnapshot ?: NormalizedQuad.FULL)
                }

                override fun onError(exception: ImageCaptureException) {
                    isCapturing = false
                    captureInFlight.set(false)
                    onError("Capture failed: ${exception.message ?: "try again"}")
                }
            }
        )
    }

    // Apply flash & torch mode reactively
    LaunchedEffect(flashState, boundCamera, imageCaptureUseCase) {
        val cam = boundCamera
        val ic = imageCaptureUseCase
        when (flashState) {
            FlashState.OFF -> {
                cam?.cameraControl?.enableTorch(false)
                ic?.flashMode = ImageCapture.FLASH_MODE_OFF
            }
            FlashState.AUTO -> {
                cam?.cameraControl?.enableTorch(false)
                ic?.flashMode = ImageCapture.FLASH_MODE_AUTO
            }
            FlashState.ON -> {
                cam?.cameraControl?.enableTorch(false)
                ic?.flashMode = ImageCapture.FLASH_MODE_ON
            }
            FlashState.TORCH -> {
                ic?.flashMode = ImageCapture.FLASH_MODE_OFF
                cam?.cameraControl?.enableTorch(true)
            }
        }
    }

    val animatedStability by animateFloatAsState(
        targetValue = stabilityProgress,
        animationSpec = tween(durationMillis = 120),
        label = "auto_capture_stability"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .testTag("live_document_camera_view")
    ) {
        // 1. Live CameraX PreviewView
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                }

                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    try {
                        val cameraProvider = providerFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }
                        val imageCapture = ImageCapture.Builder()
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                            .build()

                        var smoothedQuad: NormalizedQuad? = null
                        var steadyStartMs = 0L
                        var lastAnalyzedMs = 0L

                        val analysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                            .also { ia ->
                                ia.setAnalyzer(analysisExecutor) { imageProxy ->
                                    try {
                                        val now = System.currentTimeMillis()
                                        // Analyze at ~12–14 FPS for buttery tracking with minimal CPU/battery
                                        if (now - lastAnalyzedMs >= 75L) {
                                            lastAnalyzedMs = now
                                            val rawQuad = analyzeImageProxyForDocumentQuad(imageProxy)
                                            if (rawQuad != null) {
                                                val nextQuad = DocumentEdgeDetector.smoothQuad(smoothedQuad, rawQuad, alpha = 0.38f)
                                                val delta = if (smoothedQuad != null) {
                                                    DocumentEdgeDetector.quadDelta(smoothedQuad!!, nextQuad)
                                                } else 1f
                                                smoothedQuad = nextQuad

                                                val inCooldown = (now - lastAutoShotMs.get()) < 1500L
                                                val canAutoShoot = latestAutoEnabled &&
                                                    !captureInFlight.get() &&
                                                    !inCooldown &&
                                                    !(latestScanMode == "idcard" && latestCapturedCount >= 2)

                                                val progress = if (canAutoShoot && delta < 0.028f) {
                                                    if (steadyStartMs == 0L) steadyStartMs = now
                                                    ((now - steadyStartMs).toFloat() / 680f).coerceIn(0f, 1f)
                                                } else {
                                                    steadyStartMs = 0L
                                                    0f
                                                }

                                                val mainExec = ContextCompat.getMainExecutor(ctx)
                                                mainExec.execute {
                                                    detectedQuad = nextQuad
                                                    stabilityProgress = progress
                                                    if (progress >= 1f && canAutoShoot) {
                                                        steadyStartMs = 0L
                                                        triggerInstantCapture(nextQuad)
                                                    }
                                                }
                                            } else {
                                                smoothedQuad = null
                                                steadyStartMs = 0L
                                                ContextCompat.getMainExecutor(ctx).execute {
                                                    detectedQuad = null
                                                    stabilityProgress = 0f
                                                }
                                            }
                                        }
                                    } finally {
                                        imageProxy.close()
                                    }
                                }
                            }

                        cameraProvider.unbindAll()
                        val camera = cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageCapture,
                            analysis
                        )
                        boundCamera = camera
                        imageCaptureUseCase = imageCapture
                        cameraError = null

                        // Tap-to-focus on viewfinder
                        previewView.setOnTouchListener { view, event ->
                            if (event.action == MotionEvent.ACTION_UP) {
                                val point = previewView.meteringPointFactory.createPoint(event.x, event.y)
                                val action = FocusMeteringAction.Builder(point)
                                    .setAutoCancelDuration(3, TimeUnit.SECONDS)
                                    .build()
                                camera.cameraControl.startFocusAndMetering(action)
                                view.performClick()
                            }
                            true
                        }
                    } catch (e: Exception) {
                        cameraError = e.message ?: "Camera unavailable on this device"
                    }
                }, ContextCompat.getMainExecutor(ctx))

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // 2. Real-time Document Edge Overlay + Grid + ID Card Guide
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height

            if (showGrid) {
                val gridColor = Color.White.copy(alpha = 0.28f)
                drawLine(gridColor, Offset(w / 3f, 0f), Offset(w / 3f, h), strokeWidth = 1.dp.toPx())
                drawLine(gridColor, Offset(2f * w / 3f, 0f), Offset(2f * w / 3f, h), strokeWidth = 1.dp.toPx())
                drawLine(gridColor, Offset(0f, h / 3f), Offset(w, h / 3f), strokeWidth = 1.dp.toPx())
                drawLine(gridColor, Offset(0f, 2f * h / 3f), Offset(w, 2f * h / 3f), strokeWidth = 1.dp.toPx())
            }

            if (scanMode == "idcard") {
                val cardW = w * 0.84f
                val cardH = cardW * 0.63f
                val left = (w - cardW) / 2f
                val top = (h - cardH) / 2f
                drawRoundRect(
                    color = Color(0xFF38BDF8),
                    topLeft = Offset(left, top),
                    size = Size(cardW, cardH),
                    cornerRadius = CornerRadius(18.dp.toPx()),
                    style = Stroke(width = 2.5.dp.toPx())
                )
            }

            val q = detectedQuad
            if (q != null) {
                val p0 = Offset(q.tlX * w, q.tlY * h)
                val p1 = Offset(q.trX * w, q.trY * h)
                val p2 = Offset(q.brX * w, q.brY * h)
                val p3 = Offset(q.blX * w, q.blY * h)

                val locking = animatedStability > 0.2f
                val strokeColor = if (locking) Color(0xFF22C55E) else Color(0xFF38BDF8)
                val fillColor = strokeColor.copy(alpha = if (locking) 0.22f else 0.14f)

                val path = Path().apply {
                    moveTo(p0.x, p0.y)
                    lineTo(p1.x, p1.y)
                    lineTo(p2.x, p2.y)
                    lineTo(p3.x, p3.y)
                    close()
                }
                drawPath(path, color = fillColor)
                drawPath(path, color = strokeColor, style = Stroke(width = 3.dp.toPx()))

                listOf(p0, p1, p2, p3).forEach { corner ->
                    drawCircle(color = Color.White, radius = 7.dp.toPx(), center = corner)
                    drawCircle(color = strokeColor, radius = 4.5.dp.toPx(), center = corner)
                }
            }
        }

        // 3. Instant White Shutter Flash Feedback
        AnimatedVisibility(
            visible = showShutterFlash,
            enter = fadeIn(tween(40)),
            exit = fadeOut(tween(110)),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(modifier = Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.72f)))
        }

        // 4. Camera Fallback Banner (e.g. emulator without back camera)
        if (cameraError != null) {
            Surface(
                color = Color(0xCC0F172A),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Rounded.DocumentScanner, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(36.dp))
                    Text("Live Camera Preview Unavailable", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    Text(
                        "Use Photos Picker or Google AI Scan below to import & enhance pages.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.78f)
                    )
                }
            }
        }

        // 5. Top Control Bar (Edge-to-Edge Status Bar Safe)
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.48f))
                .statusBarsPadding()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                IconButton(
                    onClick = onClose,
                    modifier = Modifier.size(48.dp).testTag("live_scanner_close_btn")
                ) {
                    Icon(Icons.Rounded.Close, contentDescription = "Close Scanner", tint = Color.White)
                }

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    // Flash / Torch Cycle
                    Surface(
                        color = if (flashState != FlashState.OFF) Color(0xFFF59E0B).copy(alpha = 0.25f) else Color.White.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                val all = FlashState.entries
                                flashState = all[(all.indexOf(flashState) + 1) % all.size]
                            }
                            .testTag("live_scanner_flash_btn")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = when (flashState) {
                                    FlashState.OFF -> Icons.Rounded.FlashOff
                                    FlashState.AUTO -> Icons.Rounded.FlashAuto
                                    FlashState.ON -> Icons.Rounded.FlashOn
                                    FlashState.TORCH -> Icons.Rounded.FlashlightOn
                                },
                                contentDescription = "Flash mode ${flashState.name}",
                                tint = if (flashState != FlashState.OFF) Color(0xFFFBBF24) else Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = when (flashState) {
                                    FlashState.OFF -> "Off"
                                    FlashState.AUTO -> "Auto"
                                    FlashState.ON -> "Flash"
                                    FlashState.TORCH -> "Torch"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // Grid Overlay Toggle
                    IconButton(
                        onClick = { showGrid = !showGrid },
                        modifier = Modifier.size(44.dp).testTag("live_scanner_grid_btn")
                    ) {
                        Icon(
                            if (showGrid) Icons.Rounded.GridOn else Icons.Rounded.GridOff,
                            contentDescription = "Toggle Grid",
                            tint = if (showGrid) Color(0xFF38BDF8) else Color.White
                        )
                    }

                    // Auto vs Manual Shutter Toggle
                    Surface(
                        color = if (autoCaptureEnabled) Color(0xFF22C55E).copy(alpha = 0.28f) else Color.White.copy(alpha = 0.16f),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .border(
                                1.dp,
                                if (autoCaptureEnabled) Color(0xFF22C55E) else Color.White.copy(alpha = 0.3f),
                                RoundedCornerShape(12.dp)
                            )
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { autoCaptureEnabled = !autoCaptureEnabled }
                            .testTag("live_scanner_auto_toggle")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Rounded.AutoAwesome,
                                contentDescription = "Toggle Auto Capture",
                                tint = if (autoCaptureEnabled) Color(0xFF4ADE80) else Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = if (autoCaptureEnabled) "AUTO" else "MANUAL",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Live Guidance Pill
            Spacer(Modifier.height(6.dp))
            val statusText = when {
                scanMode == "idcard" && capturedCount == 0 -> "Align FRONT of ID Card inside frame"
                scanMode == "idcard" && capturedCount == 1 -> "Now flip & align BACK of ID Card"
                scanMode == "idcard" && capturedCount >= 2 -> "Both sides captured · Tap Review →"
                animatedStability > 0.2f -> "Hold steady — Auto-capturing…"
                detectedQuad != null -> "Document locked · Tap shutter or hold steady"
                else -> "Point at document · Instant edge detection"
            }
            Surface(
                color = Color.Black.copy(alpha = 0.62f),
                shape = RoundedCornerShape(999.dp)
            ) {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (animatedStability > 0.2f) Color(0xFF4ADE80) else Color.White,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }
        }

        // 6. Bottom Deck: Modes + Shutter + Gallery + Live Page Stack
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.68f))
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Mode Selector Pills (Batch / Single / ID Card)
            if (!isAppendMode) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    listOf(
                        "batch" to "Batch",
                        "single" to "Single",
                        "idcard" to "ID Card"
                    ).forEach { (id, label) ->
                        val selected = scanMode == id
                        Surface(
                            color = if (selected) Color(0xFF2563EB) else Color.White.copy(alpha = 0.14f),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .clickable { onScanModeChange(id) }
                                .testTag("live_scanner_mode_$id")
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelLarge,
                                color = Color.White,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp)
                            )
                        }
                    }
                }
            }

            // Main Action Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Left: Gallery + Optional Google AI Scan
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        color = Color.White.copy(alpha = 0.16f),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .size(50.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .clickable(onClick = onOpenGallery)
                            .testTag("live_scanner_gallery_btn")
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.PhotoLibrary, contentDescription = "Pick Photos", tint = Color.White, modifier = Modifier.size(24.dp))
                        }
                    }
                    Surface(
                        color = Color.White.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .size(50.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .clickable(onClick = onOpenMlKitFallback)
                            .testTag("live_scanner_mlkit_fallback_btn")
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.DocumentScanner, contentDescription = "Google AI Scanner", tint = Color(0xFF93C5FD), modifier = Modifier.size(22.dp))
                        }
                    }
                }

                // Center: Genius Scan Instant Shutter Button with Auto-Capture Ring
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(78.dp)
                        .clip(CircleShape)
                        .clickable(enabled = !isCapturing) {
                            triggerInstantCapture(latestDetectedQuad)
                        }
                        .testTag("live_scanner_shutter_btn")
                ) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        drawCircle(
                            color = Color.White.copy(alpha = 0.35f),
                            style = Stroke(width = 4.dp.toPx())
                        )
                        if (animatedStability > 0.02f) {
                            drawArc(
                                color = Color(0xFF22C55E),
                                startAngle = -90f,
                                sweepAngle = animatedStability * 360f,
                                useCenter = false,
                                style = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
                            )
                        }
                    }
                    Box(
                        modifier = Modifier
                            .size(62.dp)
                            .clip(CircleShape)
                            .background(if (isCapturing) Color(0xFF38BDF8) else Color.White)
                    )
                }

                // Right: Live Captured Page Stack / Review Studio Pill
                if (capturedCount > 0) {
                    Surface(
                        color = Color(0xFF22C55E),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier
                            .height(52.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .clickable(onClick = onOpenReviewStudio)
                            .testTag("live_scanner_review_btn")
                    ) {
                        Row(
                            modifier = Modifier.padding(start = 6.dp, end = 12.dp, top = 5.dp, bottom = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (lastCapturedUri != null) {
                                AsyncImage(
                                    model = lastCapturedUri,
                                    contentDescription = "Latest scanned page",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .border(1.5.dp, Color.White, RoundedCornerShape(10.dp))
                                )
                            }
                            Column {
                                Text(
                                    text = "$capturedCount pg",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("Review", style = MaterialTheme.typography.labelSmall, color = Color.White)
                                    Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
                                }
                            }
                        }
                    }
                } else {
                    Surface(
                        color = Color.White.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .height(50.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .clickable(onClick = onOpenReviewStudio)
                            .testTag("live_scanner_studio_btn")
                    ) {
                        Box(
                            modifier = Modifier.padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("Studio", style = MaterialTheme.typography.labelLarge, color = Color.White)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Zero-JPEG-overhead downsampler reading CameraX YUV_420_888 plane 0 (pure luma)
 * into a small portrait/landscape-oriented grid matching PreviewView orientation.
 */
private fun analyzeImageProxyForDocumentQuad(imageProxy: ImageProxy): NormalizedQuad? {
    val plane = imageProxy.planes.firstOrNull() ?: return null
    val srcW = imageProxy.width
    val srcH = imageProxy.height
    if (srcW <= 0 || srcH <= 0) return null

    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val buffer = plane.buffer
    val rot = ((imageProxy.imageInfo.rotationDegrees % 360) + 360) % 360

    val swapDims = (rot == 90 || rot == 270)
    val orientedW = if (swapDims) srcH else srcW
    val orientedH = if (swapDims) srcW else srcH

    val targetW = if (orientedW >= orientedH) 128 else 96
    val targetH = if (orientedW >= orientedH) 96 else 128
    val grid = ByteArray(targetW * targetH)
    val capacity = buffer.capacity()

    for (ty in 0 until targetH) {
        val ny = (ty + 0.5f) / targetH
        for (tx in 0 until targetW) {
            val nx = (tx + 0.5f) / targetW
            // Map display-oriented (nx, ny) back to raw sensor (sx, sy)
            val (sxNorm, syNorm) = when (rot) {
                90 -> ny to (1f - nx)
                180 -> (1f - nx) to (1f - ny)
                270 -> (1f - ny) to nx
                else -> nx to ny
            }
            val sx = (sxNorm * (srcW - 1)).toInt().coerceIn(0, srcW - 1)
            val sy = (syNorm * (srcH - 1)).toInt().coerceIn(0, srcH - 1)
            val idx = sy * rowStride + sx * pixelStride
            grid[ty * targetW + tx] = if (idx in 0 until capacity) buffer.get(idx) else 0
        }
    }

    return DocumentEdgeDetector.detectFromLumaGrid(grid, targetW, targetH)
}
