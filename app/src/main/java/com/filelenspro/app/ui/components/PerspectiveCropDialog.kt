package com.filelenspro.app.ui.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.rounded.AspectRatio
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Compare
import androidx.compose.material.icons.rounded.Crop
import androidx.compose.material.icons.rounded.CropFree
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.domain.engine.DocumentEdgeDetector
import com.filelenspro.app.service.OcrAndPdfEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.hypot
import kotlin.math.roundToInt

private val CROP_PREVIEW_FILTERS = listOf(
    "magic" to "Magic Color",
    "bw" to "B&W Clean",
    "whiteboard" to "Whiteboard",
    "grayscale" to "Grayscale",
    "original" to "Photo"
)

private enum class CropAspectPreset(val label: String, val ratio: Float?) {
    AUTO_3D("Auto 3D", null),
    A4("A4 Sheet", 0.707f),
    ID_CARD("ID Card", 1.586f)
}

private data class CropUndoSnapshot(
    val quad: NormalizedQuad,
    val rotationDeg: Int
)

/**
 * Pro-Level Genius Scan / Google Docs Scanner Interactive 4-Corner Perspective Straightener:
 * - Zero-freeze relative delta dragging on all 4 corners + red invalid-shape convexity guard
 * - Perspective-ray edge-bar sliding along adjacent converging document edges
 * - Smooth animated Auto / Full / Undo / Magnetic Snap transitions (0ms immediate during drag)
 * - Finger-tracking 3.5× circular Magnifier Loupe floating above the active corner (auto-flipping
 *   near screen edges) with live converging polygon border rays & precision crosshair
 * - Undo history stack for corners & rotations
 * - Live shadow-free Magic Color / B&W Preview with Proportion Lock (Auto 3D / A4 / ID Card),
 *   pinch-to-zoom, double-tap zoom, and hold-to-compare Original
 */
@Composable
fun PerspectiveCropDialog(
    imageUri: Uri,
    pageLabel: String,
    initialQuad: NormalizedQuad,
    initialRotationDeg: Int = 0,
    initialFilter: String = "magic",
    engine: OcrAndPdfEngine,
    onDismiss: () -> Unit,
    onApply: (NormalizedQuad, Int, String) -> Unit
) {
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current

    var currentRotation by remember(imageUri, initialRotationDeg) {
        mutableIntStateOf(((initialRotationDeg % 360) + 360) % 360)
    }
    var currentFilter by remember(imageUri, initialFilter) { mutableStateOf(initialFilter) }
    var displayQuad by remember(imageUri, initialQuad, initialRotationDeg) {
        mutableStateOf(DocumentEdgeDetector.rotateQuadCW(initialQuad, initialRotationDeg))
    }
    var undoStack by remember(imageUri) { mutableStateOf<List<CropUndoSnapshot>>(emptyList()) }
    var dragStartSnapshot by remember { mutableStateOf<CropUndoSnapshot?>(null) }

    // 0..3 = TL/TR/BR/BL corners; 4..7 = Top/Right/Bottom/Left edge bars; 8 = whole-quad pan; -1 = idle
    var activeHandle by remember { mutableIntStateOf(-1) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var displayBitmap by remember(imageUri) { mutableStateOf<Bitmap?>(null) }
    var cornerMap by remember(imageUri) { mutableStateOf<DocumentEdgeDetector.EdgeCornerMap?>(null) }
    var magnetSnapEnabled by remember { mutableStateOf(true) }
    var isDetecting by remember { mutableStateOf(false) }
    var isPreviewMode by remember { mutableStateOf(false) }
    var isHoldingCompareOriginal by remember { mutableStateOf(false) }
    var previewBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isRenderingPreview by remember { mutableStateOf(false) }
    var selectedAspect by remember(imageUri) { mutableStateOf(CropAspectPreset.AUTO_3D) }
    var previewZoom by remember { mutableFloatStateOf(1f) }
    var previewPan by remember { mutableStateOf(Offset.Zero) }
    var statusBadge by remember { mutableStateOf<String?>(null) }
    var statusBadgeKey by remember { mutableIntStateOf(0) }

    val isQuadValid = remember(displayQuad) {
        DocumentEdgeDetector.isConvexForWarp(displayQuad)
    }

    fun pushUndo(snapshot: CropUndoSnapshot = CropUndoSnapshot(displayQuad, currentRotation)) {
        val last = undoStack.lastOrNull()
        if (last != snapshot) {
            undoStack = (undoStack + snapshot).takeLast(20)
        }
    }

    fun flashStatus(msg: String) {
        statusBadge = msg
        statusBadgeKey++
    }

    LaunchedEffect(statusBadgeKey) {
        if (statusBadgeKey > 0) {
            delay(1800)
            statusBadge = null
        }
    }

    // Reset preview zoom when leaving preview mode or changing filter/aspect
    LaunchedEffect(isPreviewMode, selectedAspect) {
        previewZoom = 1f
        previewPan = Offset.Zero
    }

    // Smooth animated coordinates for Auto/Full/Undo/Snap; 0ms immediate during active finger drag
    val animSpec = if (activeHandle >= 0) {
        snap<Float>()
    } else {
        tween<Float>(durationMillis = 210, easing = FastOutSlowInEasing)
    }
    val animTlX by animateFloatAsState(displayQuad.tlX, animSpec, label = "tlX")
    val animTlY by animateFloatAsState(displayQuad.tlY, animSpec, label = "tlY")
    val animTrX by animateFloatAsState(displayQuad.trX, animSpec, label = "trX")
    val animTrY by animateFloatAsState(displayQuad.trY, animSpec, label = "trY")
    val animBrX by animateFloatAsState(displayQuad.brX, animSpec, label = "brX")
    val animBrY by animateFloatAsState(displayQuad.brY, animSpec, label = "brY")
    val animBlX by animateFloatAsState(displayQuad.blX, animSpec, label = "blX")
    val animBlY by animateFloatAsState(displayQuad.blY, animSpec, label = "blY")

    // Decode exact EXIF-corrected + rotated bitmap once per rotation change + compute edge corner map
    LaunchedEffect(imageUri, currentRotation) {
        val loaded = engine.decodeOrientedBitmap(imageUri.toString(), currentRotation, maxDim = 1520)
        val old = displayBitmap
        displayBitmap = loaded
        if (old != null && old !== loaded && !old.isRecycled) {
            old.recycle()
        }
        cornerMap = if (loaded != null && !loaded.isRecycled) {
            withContext(Dispatchers.Default) { DocumentEdgeDetector.computeEdgeCornerMap(loaded) }
        } else null
    }

    // Render live straightened + shadow-free filtered preview bitmap when Preview mode is active
    LaunchedEffect(isPreviewMode, displayQuad, currentRotation, currentFilter, selectedAspect) {
        if (isPreviewMode && DocumentEdgeDetector.isConvexForWarp(displayQuad)) {
            isRenderingPreview = true
            val unrotatedQuad = DocumentEdgeDetector.rotateQuadInverse(displayQuad, currentRotation)
            val rendered = engine.renderPagePreviewBitmap(
                uriString = imageUri.toString(),
                quad = unrotatedQuad,
                filter = currentFilter,
                rotationDeg = currentRotation,
                maxDim = 1280,
                forcedAspectRatio = selectedAspect.ratio
            )
            val oldPrev = previewBitmap
            previewBitmap = rendered
            if (oldPrev != null && oldPrev !== rendered && !oldPrev.isRecycled) {
                oldPrev.recycle()
            }
            isRenderingPreview = false
        } else {
            val oldPrev = previewBitmap
            previewBitmap = null
            if (oldPrev != null && !oldPrev.isRecycled) oldPrev.recycle()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            previewBitmap?.takeIf { !it.isRecycled }?.recycle()
            displayBitmap?.takeIf { !it.isRecycled }?.recycle()
        }
    }

    val imageBitmap = remember(displayBitmap) {
        displayBitmap?.takeIf { !it.isRecycled }?.asImageBitmap()
    }
    val previewImageBitmap = remember(previewBitmap) {
        previewBitmap?.takeIf { !it.isRecycled }?.asImageBitmap()
    }

    val imageRect = remember(containerSize, displayBitmap) {
        val bmp = displayBitmap
        if (containerSize.width <= 0 || containerSize.height <= 0 || bmp == null || bmp.isRecycled) {
            Rect.Zero
        } else {
            val cw = containerSize.width.toFloat()
            val ch = containerSize.height.toFloat()
            val iw = bmp.width.toFloat().coerceAtLeast(1f)
            val ih = bmp.height.toFloat().coerceAtLeast(1f)
            val scale = minOf(cw / iw, ch / ih)
            val rw = iw * scale
            val rh = ih * scale
            val left = (cw - rw) / 2f
            val top = (ch - rh) / 2f
            Rect(left, top, left + rw, top + rh)
        }
    }

    val latestQuad by rememberUpdatedState(displayQuad)
    val latestRotation by rememberUpdatedState(currentRotation)
    val latestRect by rememberUpdatedState(imageRect)
    val latestPreviewMode by rememberUpdatedState(isPreviewMode)
    val latestCornerMap by rememberUpdatedState(cornerMap)
    val latestMagnetSnap by rememberUpdatedState(magnetSnapEnabled)

    val cornerHitPx = with(density) { 58.dp.toPx() }
    val edgeHitPx = with(density) { 40.dp.toPx() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF060A12))
                .statusBarsPadding()
                .navigationBarsPadding()
                .testTag("perspective_crop_dialog")
        ) {
            // ─── Top Studio Bar ───
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0D1424))
                    .padding(horizontal = 6.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = "Cancel Straightening", tint = Color.White)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Straighten · $pageLabel",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    Text(
                        text = when {
                            isPreviewMode -> "Pinch to zoom · Double-tap to reset"
                            !isQuadValid -> "Corners overlap — drag to fix"
                            else -> "Drag corners or slide perspective edges"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = if (!isPreviewMode && !isQuadValid) Color(0xFFFCA5A5) else Color(0xFF94A3B8),
                        maxLines = 1
                    )
                }

                // Undo button
                if (!isPreviewMode && undoStack.isNotEmpty()) {
                    IconButton(
                        onClick = {
                            val prev = undoStack.lastOrNull() ?: return@IconButton
                            undoStack = undoStack.dropLast(1)
                            currentRotation = prev.rotationDeg
                            displayQuad = prev.quad
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            flashStatus("Undid last adjustment")
                        },
                        modifier = Modifier.size(44.dp).testTag("crop_undo_btn")
                    ) {
                        Icon(
                            Icons.AutoMirrored.Rounded.Undo,
                            contentDescription = "Undo last crop change",
                            tint = Color(0xFFE2E8F0)
                        )
                    }
                }

                // Magnetic corner snap toggle
                if (!isPreviewMode) {
                    Surface(
                        color = if (magnetSnapEnabled) Color(0xFF0EA5E9).copy(alpha = 0.22f) else Color.White.copy(alpha = 0.10f),
                        shape = RoundedCornerShape(999.dp),
                        modifier = Modifier
                            .border(
                                1.dp,
                                if (magnetSnapEnabled) Color(0xFF38BDF8) else Color.White.copy(alpha = 0.22f),
                                RoundedCornerShape(999.dp)
                            )
                            .clip(RoundedCornerShape(999.dp))
                            .clickable {
                                magnetSnapEnabled = !magnetSnapEnabled
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                flashStatus(if (magnetSnapEnabled) "Magnetic Corner Snap ON" else "Freehand Precision Mode")
                            }
                            .testTag("crop_snap_toggle_btn")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Rounded.CenterFocusStrong,
                                contentDescription = "Toggle Corner Snap",
                                tint = if (magnetSnapEnabled) Color(0xFF38BDF8) else Color(0xFF94A3B8),
                                modifier = Modifier.size(15.dp)
                            )
                            Text(
                                text = if (magnetSnapEnabled) "Snap" else "Free",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                Button(
                    enabled = isQuadValid,
                    onClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        val unrotated = DocumentEdgeDetector.rotateQuadInverse(displayQuad, currentRotation)
                        onApply(unrotated, currentRotation, currentFilter)
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF16A34A),
                        disabledContainerColor = Color(0xFF334155),
                        disabledContentColor = Color(0xFF94A3B8)
                    ),
                    contentPadding = PaddingValues(horizontal = 13.dp, vertical = 8.dp),
                    modifier = Modifier.testTag("crop_apply_btn")
                ) {
                    Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Apply", fontWeight = FontWeight.SemiBold)
                }
            }

            // ─── Main Workspace ───
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp)
                    .onSizeChanged { containerSize = it }
                    .pointerInput(isPreviewMode) {
                        if (isPreviewMode) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val nextZoom = (previewZoom * zoom).coerceIn(1f, 3.5f)
                                previewZoom = nextZoom
                                if (nextZoom <= 1.02f) {
                                    previewPan = Offset.Zero
                                } else {
                                    val maxX = (size.width * (nextZoom - 1f)) / 2f
                                    val maxY = (size.height * (nextZoom - 1f)) / 2f
                                    previewPan = Offset(
                                        (previewPan.x + pan.x).coerceIn(-maxX, maxX),
                                        (previewPan.y + pan.y).coerceIn(-maxY, maxY)
                                    )
                                }
                            }
                        }
                    }
                    .pointerInput(isPreviewMode) {
                        if (isPreviewMode) {
                            detectTapGestures(
                                onDoubleTap = {
                                    if (previewZoom > 1.15f) {
                                        previewZoom = 1f
                                        previewPan = Offset.Zero
                                    } else {
                                        previewZoom = 2.2f
                                    }
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            )
                        }
                    }
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { startPos ->
                                if (latestPreviewMode) return@detectDragGestures
                                val rect = latestRect
                                if (rect.width <= 1f || rect.height <= 1f) return@detectDragGestures
                                val q = latestQuad
                                val p0 = Offset(rect.left + q.tlX * rect.width, rect.top + q.tlY * rect.height)
                                val p1 = Offset(rect.left + q.trX * rect.width, rect.top + q.trY * rect.height)
                                val p2 = Offset(rect.left + q.brX * rect.width, rect.top + q.brY * rect.height)
                                val p3 = Offset(rect.left + q.blX * rect.width, rect.top + q.blY * rect.height)
                                val corners = listOf(p0, p1, p2, p3)
                                val mids = listOf(
                                    Offset((p0.x + p1.x) / 2f, (p0.y + p1.y) / 2f),
                                    Offset((p1.x + p2.x) / 2f, (p1.y + p2.y) / 2f),
                                    Offset((p2.x + p3.x) / 2f, (p2.y + p3.y) / 2f),
                                    Offset((p3.x + p0.x) / 2f, (p3.y + p0.y) / 2f)
                                )

                                // 1. Priority: 4 corner handles
                                var bestCorner = -1
                                var bestCornerDist = Float.MAX_VALUE
                                corners.forEachIndexed { idx, pt ->
                                    val d = hypot(pt.x - startPos.x, pt.y - startPos.y)
                                    if (d < bestCornerDist) {
                                        bestCornerDist = d
                                        bestCorner = idx
                                    }
                                }
                                if (bestCornerDist <= cornerHitPx) {
                                    dragStartSnapshot = CropUndoSnapshot(q, latestRotation)
                                    activeHandle = bestCorner
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    return@detectDragGestures
                                }

                                // 2. Secondary: 4 perspective-aware edge midpoint capsule bars
                                var bestEdge = -1
                                var bestEdgeDist = Float.MAX_VALUE
                                mids.forEachIndexed { idx, pt ->
                                    val d = hypot(pt.x - startPos.x, pt.y - startPos.y)
                                    if (d < bestEdgeDist) {
                                        bestEdgeDist = d
                                        bestEdge = 4 + idx
                                    }
                                }
                                if (bestEdgeDist <= edgeHitPx) {
                                    dragStartSnapshot = CropUndoSnapshot(q, latestRotation)
                                    activeHandle = bestEdge
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    return@detectDragGestures
                                }

                                // 3. Tertiary: Inside polygon pan (only if not full frame)
                                if (!q.isFullFrame() && isPointInQuad(startPos, p0, p1, p2, p3)) {
                                    dragStartSnapshot = CropUndoSnapshot(q, latestRotation)
                                    activeHandle = 8
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                } else {
                                    dragStartSnapshot = null
                                    activeHandle = -1
                                }
                            },
                            onDragEnd = {
                                val released = activeHandle
                                val startSnap = dragStartSnapshot
                                activeHandle = -1
                                dragStartSnapshot = null

                                // Genius Scan-style magnetic corner snap on release
                                val map = latestCornerMap
                                var finalQuad = latestQuad
                                if (latestMagnetSnap && map != null && released in 0..3) {
                                    val (curX, curY) = when (released) {
                                        0 -> finalQuad.tlX to finalQuad.tlY
                                        1 -> finalQuad.trX to finalQuad.trY
                                        2 -> finalQuad.brX to finalQuad.brY
                                        else -> finalQuad.blX to finalQuad.blY
                                    }
                                    val (sx, sy) = DocumentEdgeDetector.snapCornerToEdge(curX, curY, map)
                                    if (sx != curX || sy != curY) {
                                        val snapped = when (released) {
                                            0 -> finalQuad.copy(tlX = sx, tlY = sy)
                                            1 -> finalQuad.copy(trX = sx, trY = sy)
                                            2 -> finalQuad.copy(brX = sx, brY = sy)
                                            else -> finalQuad.copy(blX = sx, blY = sy)
                                        }
                                        if (DocumentEdgeDetector.isConvexForWarp(snapped)) {
                                            finalQuad = snapped
                                            displayQuad = snapped
                                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        }
                                    }
                                }
                                if (startSnap != null && startSnap.quad != finalQuad) {
                                    pushUndo(startSnap)
                                }
                            },
                            onDragCancel = {
                                activeHandle = -1
                                dragStartSnapshot = null
                            },
                            onDrag = { change, dragAmount ->
                                val idx = activeHandle
                                val rect = latestRect
                                if (idx < 0 || latestPreviewMode || rect.width <= 1f || rect.height <= 1f) {
                                    return@detectDragGestures
                                }
                                change.consume()
                                val q = latestQuad
                                // Pure relative delta dragging — zero corner jump under finger!
                                val dx = dragAmount.x / rect.width
                                val dy = dragAmount.y / rect.height

                                when (idx) {
                                    // Zero-freeze free corner movement: always tracks finger smoothly;
                                    // crimson red convexity guard warns if corners become concave/crossed
                                    0 -> displayQuad = q.copy(tlX = (q.tlX + dx).coerceIn(0f, 1f), tlY = (q.tlY + dy).coerceIn(0f, 1f))
                                    1 -> displayQuad = q.copy(trX = (q.trX + dx).coerceIn(0f, 1f), trY = (q.trY + dy).coerceIn(0f, 1f))
                                    2 -> displayQuad = q.copy(brX = (q.brX + dx).coerceIn(0f, 1f), brY = (q.brY + dy).coerceIn(0f, 1f))
                                    3 -> displayQuad = q.copy(blX = (q.blX + dx).coerceIn(0f, 1f), blY = (q.blY + dy).coerceIn(0f, 1f))
                                    // Perspective-ray edge-bar sliding along converging left/right/top/bottom sides
                                    in 4..7 -> {
                                        val slid = DocumentEdgeDetector.slideEdgeAlongPerspective(q, idx - 4, dx, dy)
                                        if (DocumentEdgeDetector.isConvexForWarp(slid)) {
                                            displayQuad = slid
                                        }
                                    }
                                    // Whole-quad smooth pan
                                    else -> {
                                        val minX = minOf(q.tlX, q.trX, q.brX, q.blX)
                                        val maxX = maxOf(q.tlX, q.trX, q.brX, q.blX)
                                        val minY = minOf(q.tlY, q.trY, q.brY, q.blY)
                                        val maxY = maxOf(q.tlY, q.trY, q.brY, q.blY)
                                        val clDx = dx.coerceIn(-minX, 1f - maxX)
                                        val clDy = dy.coerceIn(-minY, 1f - maxY)
                                        displayQuad = q.copy(
                                            tlX = q.tlX + clDx, tlY = q.tlY + clDy,
                                            trX = q.trX + clDx, trY = q.trY + clDy,
                                            brX = q.brX + clDx, brY = q.brY + clDy,
                                            blX = q.blX + clDx, blY = q.blY + clDy
                                        )
                                    }
                                }
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                if (imageBitmap == null) {
                    CircularProgressIndicator(color = Color(0xFF38BDF8))
                } else if (isPreviewMode) {
                    val activeBmp = if (isHoldingCompareOriginal) imageBitmap else (previewImageBitmap ?: imageBitmap)
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(12.dp))
                            .border(
                                1.5.dp,
                                if (isHoldingCompareOriginal) Color(0xFFF59E0B) else Color(0xFF22C55E).copy(alpha = 0.7f),
                                RoundedCornerShape(12.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            bitmap = activeBmp,
                            contentDescription = if (isHoldingCompareOriginal) "Original photo" else "Straightened scan preview",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer {
                                    scaleX = previewZoom
                                    scaleY = previewZoom
                                    translationX = previewPan.x
                                    translationY = previewPan.y
                                }
                        )
                    }

                    if (isRenderingPreview) {
                        CircularProgressIndicator(
                            color = Color(0xFF38BDF8),
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    // Top Preview Header Pill + Tactile Press-and-Hold Compare Button
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = Color.Black.copy(alpha = 0.74f),
                            shape = RoundedCornerShape(999.dp)
                        ) {
                            Text(
                                text = if (isHoldingCompareOriginal) {
                                    "ORIGINAL PHOTO"
                                } else {
                                    val fName = CROP_PREVIEW_FILTERS.firstOrNull { it.first == currentFilter }?.second ?: "Magic"
                                    val zoomSuffix = if (previewZoom > 1.05f) " · ${"%.1f".format(previewZoom)}×" else ""
                                    "STRAIGHTENED · $fName$zoomSuffix"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isHoldingCompareOriginal) Color(0xFFFBBF24) else Color(0xFF4ADE80),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }

                        Surface(
                            color = if (isHoldingCompareOriginal) Color(0xFFF59E0B) else Color.Black.copy(alpha = 0.74f),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier
                                .border(
                                    1.dp,
                                    if (isHoldingCompareOriginal) Color(0xFFFDE68A) else Color.White.copy(alpha = 0.25f),
                                    RoundedCornerShape(999.dp)
                                )
                                .clip(RoundedCornerShape(999.dp))
                                .pointerInput(Unit) {
                                    detectTapGestures(
                                        onPress = {
                                            isHoldingCompareOriginal = true
                                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                            tryAwaitRelease()
                                            isHoldingCompareOriginal = false
                                        }
                                    )
                                }
                                .testTag("crop_hold_compare_btn")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.Rounded.Compare,
                                    contentDescription = "Hold to compare original",
                                    tint = if (isHoldingCompareOriginal) Color.Black else Color.White,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = "Hold Original",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isHoldingCompareOriginal) Color.Black else Color.White,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                } else {
                    Image(
                        bitmap = imageBitmap,
                        contentDescription = "Document photo for 4-corner perspective straightening",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize()
                    )

                    if (imageRect.width > 1f && imageRect.height > 1f) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val p0 = Offset(imageRect.left + animTlX * imageRect.width, imageRect.top + animTlY * imageRect.height)
                            val p1 = Offset(imageRect.left + animTrX * imageRect.width, imageRect.top + animTrY * imageRect.height)
                            val p2 = Offset(imageRect.left + animBrX * imageRect.width, imageRect.top + animBrY * imageRect.height)
                            val p3 = Offset(imageRect.left + animBlX * imageRect.width, imageRect.top + animBlY * imageRect.height)

                            val accentColor = when {
                                !isQuadValid -> Color(0xFFEF4444) // Crimson red invalid shape warning
                                activeHandle >= 0 -> Color(0xFF4ADE80) // Active precision emerald
                                else -> Color(0xFF38BDF8) // Calm cyan idle lock
                            }

                            // 1. EvenOdd darkened scrim outside the selected document polygon
                            val scrimPath = Path().apply {
                                fillType = PathFillType.EvenOdd
                                addRect(imageRect)
                                moveTo(p0.x, p0.y)
                                lineTo(p1.x, p1.y)
                                lineTo(p2.x, p2.y)
                                lineTo(p3.x, p3.y)
                                close()
                            }
                            drawPath(scrimPath, color = Color.Black.copy(alpha = 0.58f))

                            // 2. Perspective rule-of-thirds grid while actively dragging
                            if (activeHandle >= 0 && isQuadValid) {
                                val guideColor = Color.White.copy(alpha = 0.36f)
                                for (t in listOf(1f / 3f, 2f / 3f)) {
                                    val topPt = Offset(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t)
                                    val botPt = Offset(p3.x + (p2.x - p3.x) * t, p3.y + (p2.y - p3.y) * t)
                                    drawLine(guideColor, topPt, botPt, strokeWidth = 1.dp.toPx())
                                    val leftPt = Offset(p0.x + (p3.x - p0.x) * t, p0.y + (p3.y - p0.y) * t)
                                    val rightPt = Offset(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t)
                                    drawLine(guideColor, leftPt, rightPt, strokeWidth = 1.dp.toPx())
                                }
                            }

                            // 3. Crisp Google Docs / Genius Scan border polygon with outer contrast shadow
                            val poly = Path().apply {
                                moveTo(p0.x, p0.y)
                                lineTo(p1.x, p1.y)
                                lineTo(p2.x, p2.y)
                                lineTo(p3.x, p3.y)
                                close()
                            }
                            drawPath(poly, color = Color.Black.copy(alpha = 0.50f), style = Stroke(width = 4.6.dp.toPx()))
                            drawPath(poly, color = accentColor, style = Stroke(width = 2.5.dp.toPx()))

                            // 4. Google Docs Scanner–style rotated capsule edge handles along each edge slope
                            val edges = listOf(p0 to p1, p1 to p2, p2 to p3, p3 to p0)
                            val barHalfLen = 14.dp.toPx()
                            edges.forEachIndexed { eIdx, (a, b) ->
                                val edgeLen = hypot((b.x - a.x).toDouble(), (b.y - a.y).toDouble()).toFloat()
                                if (edgeLen > barHalfLen * 2.5f) {
                                    val ux = (b.x - a.x) / edgeLen
                                    val uy = (b.y - a.y) / edgeLen
                                    val mid = Offset((a.x + b.x) / 2f, (a.y + b.y) / 2f)
                                    val barStart = Offset(mid.x - ux * barHalfLen, mid.y - uy * barHalfLen)
                                    val barEnd = Offset(mid.x + ux * barHalfLen, mid.y + uy * barHalfLen)
                                    val isEdgeActive = activeHandle == 4 + eIdx
                                    drawLine(
                                        color = Color.Black.copy(alpha = 0.55f),
                                        start = barStart,
                                        end = barEnd,
                                        strokeWidth = (if (isEdgeActive) 9.dp else 7.dp).toPx(),
                                        cap = StrokeCap.Round
                                    )
                                    drawLine(
                                        color = when {
                                            !isQuadValid -> Color(0xFFFCA5A5)
                                            isEdgeActive -> Color(0xFF4ADE80)
                                            else -> Color.White
                                        },
                                        start = barStart,
                                        end = barEnd,
                                        strokeWidth = (if (isEdgeActive) 5.5.dp else 4.2.dp).toPx(),
                                        cap = StrokeCap.Round
                                    )
                                }
                            }

                            // 5. Genius Scan precision hollow-center target corner rings
                            val corners = listOf(p0, p1, p2, p3)
                            corners.forEachIndexed { idx, pt ->
                                val isSelected = activeHandle == idx
                                if (isSelected) {
                                    drawCircle(
                                        color = accentColor.copy(alpha = 0.24f),
                                        radius = 24.dp.toPx(),
                                        center = pt
                                    )
                                    drawCircle(
                                        color = Color.White,
                                        radius = 16.dp.toPx(),
                                        center = pt,
                                        style = Stroke(width = 2.6.dp.toPx())
                                    )
                                    val arm = 8.dp.toPx()
                                    drawLine(accentColor, Offset(pt.x - arm, pt.y), Offset(pt.x + arm, pt.y), strokeWidth = 1.6.dp.toPx())
                                    drawLine(accentColor, Offset(pt.x, pt.y - arm), Offset(pt.x, pt.y + arm), strokeWidth = 1.6.dp.toPx())
                                } else {
                                    drawCircle(
                                        color = Color.Black.copy(alpha = 0.45f),
                                        radius = 14.dp.toPx(),
                                        center = pt
                                    )
                                    drawCircle(
                                        color = Color(0xFF0F172A).copy(alpha = 0.32f),
                                        radius = 11.5.dp.toPx(),
                                        center = pt
                                    )
                                    drawCircle(
                                        color = Color.White,
                                        radius = 11.5.dp.toPx(),
                                        center = pt,
                                        style = Stroke(width = 2.8.dp.toPx())
                                    )
                                    drawCircle(
                                        color = accentColor,
                                        radius = 4.dp.toPx(),
                                        center = pt
                                    )
                                }
                            }

                            // 6. Pro Finger-Tracking 3.5× Optical Magnifier Loupe
                            //    Floats directly above the dragged corner (auto-flipping cleanly when
                            //    near the top/side screen edges so the user's thumb NEVER blocks view!)
                            if (activeHandle in 0..3) {
                                val normPts = listOf(
                                    animTlX to animTlY,
                                    animTrX to animTrY,
                                    animBrX to animBrY,
                                    animBlX to animBlY
                                )
                                val (normX, normY) = normPts[activeHandle]
                                val prevNorm = normPts[(activeHandle + 3) % 4]
                                val nextNorm = normPts[(activeHandle + 1) % 4]
                                val handleScreenPt = corners[activeHandle]

                                val loupeR = 64.dp.toPx()
                                val edgePad = 10.dp.toPx()
                                val liftGap = 48.dp.toPx()

                                // Primary: float directly above the finger. If too close to the top edge,
                                // shift smoothly to the opposite horizontal side of the finger!
                                val preferredCy = handleScreenPt.y - loupeR - liftGap
                                val (loupeCx, loupeCy) = if (preferredCy >= loupeR + edgePad) {
                                    handleScreenPt.x.coerceIn(loupeR + edgePad, (size.width - loupeR - edgePad).coerceAtLeast(loupeR + edgePad)) to preferredCy
                                } else {
                                    val sideOffsetX = if (handleScreenPt.x < size.width * 0.5f) {
                                        handleScreenPt.x + loupeR + liftGap
                                    } else {
                                        handleScreenPt.x - loupeR - liftGap
                                    }
                                    val safeX = sideOffsetX.coerceIn(loupeR + edgePad, (size.width - loupeR - edgePad).coerceAtLeast(loupeR + edgePad))
                                    val safeY = (handleScreenPt.y + loupeR * 0.45f).coerceIn(loupeR + edgePad, (size.height - loupeR - edgePad).coerceAtLeast(loupeR + edgePad))
                                    safeX to safeY
                                }

                                val loupeRect = Rect(loupeCx - loupeR, loupeCy - loupeR, loupeCx + loupeR, loupeCy + loupeR)
                                val loupeClip = Path().apply { addOval(loupeRect) }

                                val bmpW = imageBitmap.width
                                val bmpH = imageBitmap.height
                                // 3.5× optical magnification window (~10.5% of shortest side)
                                val sampleSpan = (minOf(bmpW, bmpH) * 0.105f).roundToInt().coerceIn(36, 210)
                                val halfSpan = sampleSpan / 2
                                val srcCx = normX * bmpW
                                val srcCy = normY * bmpH
                                val srcLeft = (srcCx.roundToInt() - halfSpan).coerceIn(0, (bmpW - sampleSpan).coerceAtLeast(0))
                                val srcTop = (srcCy.roundToInt() - halfSpan).coerceIn(0, (bmpH - sampleSpan).coerceAtLeast(0))
                                val actualW = sampleSpan.coerceAtMost(bmpW - srcLeft).coerceAtLeast(1)
                                val actualH = sampleSpan.coerceAtMost(bmpH - srcTop).coerceAtLeast(1)

                                // Subtle pointer tether line connecting the active corner to the floating loupe
                                drawLine(
                                    color = accentColor.copy(alpha = 0.45f),
                                    start = handleScreenPt,
                                    end = Offset(loupeCx, loupeCy),
                                    strokeWidth = 1.5.dp.toPx()
                                )

                                // Elevated shadow halo
                                drawCircle(color = Color.Black.copy(alpha = 0.70f), radius = loupeR + 6.dp.toPx(), center = Offset(loupeCx, loupeCy))
                                clipPath(loupeClip) {
                                    drawRect(color = Color(0xFF0A0F1C), topLeft = loupeRect.topLeft, size = loupeRect.size)
                                    drawImage(
                                        image = imageBitmap,
                                        srcOffset = IntOffset(srcLeft, srcTop),
                                        srcSize = IntSize(actualW, actualH),
                                        dstOffset = IntOffset(loupeRect.left.roundToInt(), loupeRect.top.roundToInt()),
                                        dstSize = IntSize((loupeR * 2f).roundToInt(), (loupeR * 2f).roundToInt())
                                    )

                                    fun bmpToLoupe(bx: Float, by: Float): Offset {
                                        val rx = (bx - srcLeft) / actualW.toFloat()
                                        val ry = (by - srcTop) / actualH.toFloat()
                                        return Offset(loupeRect.left + rx * loupeRect.width, loupeRect.top + ry * loupeRect.height)
                                    }

                                    val vCenter = bmpToLoupe(srcCx, srcCy)
                                    val vPrev = bmpToLoupe(prevNorm.first * bmpW, prevNorm.second * bmpH)
                                    val vNext = bmpToLoupe(nextNorm.first * bmpW, nextNorm.second * bmpH)

                                    // Live converging polygon border lines inside the 3.5× loupe
                                    drawLine(Color.Black.copy(alpha = 0.60f), vCenter, vPrev, strokeWidth = 4.2.dp.toPx())
                                    drawLine(Color.Black.copy(alpha = 0.60f), vCenter, vNext, strokeWidth = 4.2.dp.toPx())
                                    drawLine(accentColor, vCenter, vPrev, strokeWidth = 2.2.dp.toPx())
                                    drawLine(accentColor, vCenter, vNext, strokeWidth = 2.2.dp.toPx())

                                    // Broken precision reticle crosshair centered on the exact corner vertex
                                    val arm = 18.dp.toPx()
                                    val gap = 4.5.dp.toPx()
                                    drawLine(Color.White, Offset(vCenter.x - arm, vCenter.y), Offset(vCenter.x - gap, vCenter.y), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x + gap, vCenter.y), Offset(vCenter.x + arm, vCenter.y), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x, vCenter.y - arm), Offset(vCenter.x, vCenter.y - gap), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x, vCenter.y + gap), Offset(vCenter.x, vCenter.y + arm), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawCircle(accentColor, radius = 3.2.dp.toPx(), center = vCenter)
                                }
                                drawCircle(
                                    color = Color.White,
                                    radius = loupeR,
                                    center = Offset(loupeCx, loupeCy),
                                    style = Stroke(width = 3.dp.toPx())
                                )
                                drawCircle(
                                    color = accentColor,
                                    radius = loupeR - 2.dp.toPx(),
                                    center = Offset(loupeCx, loupeCy),
                                    style = Stroke(width = 1.4.dp.toPx())
                                )
                            }
                        }
                    }

                    // Live Invalid-Shape Warning Banner (Genius Scan red border companion pill)
                    androidx.compose.animation.AnimatedVisibility(
                        visible = !isQuadValid,
                        enter = fadeIn(),
                        exit = fadeOut(),
                        modifier = Modifier.align(Alignment.TopCenter).padding(top = 10.dp)
                    ) {
                        Surface(
                            color = Color(0xE67F1D1D),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier.border(1.dp, Color(0xFFEF4444), RoundedCornerShape(999.dp))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    Icons.Rounded.WarningAmber,
                                    contentDescription = null,
                                    tint = Color(0xFFFECACA),
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = "Adjust corners to form a valid rectangle",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }

                // Floating micro-status feedback pill (e.g., "Document edges locked", "Snap ON")
                androidx.compose.animation.AnimatedVisibility(
                    visible = statusBadge != null && isQuadValid,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp)
                ) {
                    statusBadge?.let { msg ->
                        Surface(
                            color = Color(0xDD0F172A),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier.border(1.dp, Color(0xFF38BDF8).copy(alpha = 0.5f), RoundedCornerShape(999.dp))
                        ) {
                            Text(
                                text = msg,
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }

            // ─── Bottom Studio Action Deck ───
            Surface(
                color = Color(0xFF0D1424),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Live Filter & Proportion Lock Strips inside Preview mode
                    AnimatedVisibility(visible = isPreviewMode) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CROP_PREVIEW_FILTERS.forEach { (id, label) ->
                                    FilterChip(
                                        selected = currentFilter == id,
                                        onClick = {
                                            currentFilter = id
                                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        },
                                        label = { Text(label, style = MaterialTheme.typography.labelMedium) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFF2563EB),
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White.copy(alpha = 0.08f),
                                            labelColor = Color(0xFFCBD5E1)
                                        )
                                    )
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Rounded.AspectRatio,
                                    contentDescription = "Output aspect ratio",
                                    tint = Color(0xFF94A3B8),
                                    modifier = Modifier.size(16.dp)
                                )
                                CropAspectPreset.entries.forEach { preset ->
                                    FilterChip(
                                        selected = selectedAspect == preset,
                                        onClick = {
                                            selectedAspect = preset
                                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        },
                                        label = { Text(preset.label, style = MaterialTheme.typography.labelSmall) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFF0EA5E9).copy(alpha = 0.30f),
                                            selectedLabelColor = Color(0xFF7DD3FC),
                                            containerColor = Color.White.copy(alpha = 0.06f),
                                            labelColor = Color(0xFF94A3B8)
                                        )
                                    )
                                }
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Auto Detect (Hough 4-line + RGB Sobel + Connected-Component hybrid)
                        OutlinedButton(
                            enabled = !isDetecting && displayBitmap != null,
                            onClick = {
                                val bmp = displayBitmap ?: return@OutlinedButton
                                scope.launch {
                                    isDetecting = true
                                    isPreviewMode = false
                                    pushUndo()
                                    val detected = withContext(Dispatchers.Default) {
                                        DocumentEdgeDetector.detectFromBitmapOrNull(bmp)
                                    }
                                    if (detected != null) {
                                        displayQuad = detected
                                        flashStatus("Smart 4-corner edges locked")
                                    } else {
                                        displayQuad = NormalizedQuad.FULL
                                        flashStatus("No distinct border — drag corners manually")
                                    }
                                    isDetecting = false
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp),
                            modifier = Modifier.weight(1f).testTag("crop_auto_detect_btn")
                        ) {
                            Icon(Icons.Rounded.AutoFixHigh, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (isDetecting) "…" else "Auto", color = Color.White, style = MaterialTheme.typography.labelLarge)
                        }

                        // Full Frame Reset
                        OutlinedButton(
                            onClick = {
                                isPreviewMode = false
                                pushUndo()
                                displayQuad = NormalizedQuad.FULL
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                flashStatus("Reset to Full Frame")
                            },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp),
                            modifier = Modifier.weight(1f).testTag("crop_full_frame_btn")
                        ) {
                            Icon(Icons.Rounded.CropFree, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Full", color = Color.White, style = MaterialTheme.typography.labelLarge)
                        }

                        // Rotate 90° (rotates photo + quad corners together)
                        OutlinedButton(
                            onClick = {
                                isPreviewMode = false
                                pushUndo()
                                currentRotation = (currentRotation + 90) % 360
                                displayQuad = DocumentEdgeDetector.rotateQuadCW(displayQuad, 90)
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            },
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp),
                            modifier = Modifier.weight(1f).testTag("crop_rotate_btn")
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = null, tint = Color(0xFFFBBF24), modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Rotate", color = Color.White, style = MaterialTheme.typography.labelLarge)
                        }

                        // Live Straightened Preview Toggle
                        Surface(
                            color = when {
                                !isQuadValid && !isPreviewMode -> Color(0xFF334155)
                                isPreviewMode -> Color(0xFF2563EB)
                                else -> Color.White.copy(alpha = 0.14f)
                            },
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier
                                .weight(1.15f)
                                .height(42.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .clickable(enabled = isPreviewMode || isQuadValid) {
                                    isPreviewMode = !isPreviewMode
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                                .testTag("crop_preview_toggle_btn")
                        ) {
                            Row(
                                modifier = Modifier.fillMaxSize(),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    if (isPreviewMode) Icons.Rounded.Crop else Icons.Rounded.Visibility,
                                    contentDescription = null,
                                    tint = if (!isQuadValid && !isPreviewMode) Color(0xFF94A3B8) else Color.White,
                                    modifier = Modifier.size(17.dp)
                                )
                                Spacer(Modifier.width(5.dp))
                                Text(
                                    if (isPreviewMode) "Edit" else "Preview",
                                    color = if (!isQuadValid && !isPreviewMode) Color(0xFF94A3B8) else Color.White,
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun isPointInQuad(p: Offset, a: Offset, b: Offset, c: Offset, d: Offset): Boolean {
    fun cross(u: Offset, v: Offset, pt: Offset): Float = (v.x - u.x) * (pt.y - u.y) - (v.y - u.y) * (pt.x - u.x)
    val c1 = cross(a, b, p)
    val c2 = cross(b, c, p)
    val c3 = cross(c, d, p)
    val c4 = cross(d, a, p)
    val allNeg = c1 <= 0f && c2 <= 0f && c3 <= 0f && c4 <= 0f
    val allPos = c1 >= 0f && c2 >= 0f && c3 >= 0f && c4 >= 0f
    return allNeg || allPos
}
