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
import androidx.compose.material.icons.rounded.CropSquare
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
 * Rock-Solid Google Docs Scanner / Genius Scan Pro 4-Corner Perspective Straightener:
 * - Keyed strictly on [imageUri] so background jobs never reset corners mid-edit
 * - Pure manual precision by default (Magnetic Snap optional) so corners stay 100% locked where placed
 * - Parallel-stable rectangular edge-bar dragging + 1-tap "Rect" 90° square-up + "Auto" Hough detect
 * - Rock-steady opposite-corner 3.5× circular Magnifier Loupe with live converging border rays
 * - Segmented "Adjust Corners" | "Preview Scan" switcher + Icon-above-Label bottom dock (zero wrapping!)
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

    // Keyed strictly on imageUri so external list updates NEVER jump or reset the user's active edit
    var currentRotation by remember(imageUri) {
        mutableIntStateOf(((initialRotationDeg % 360) + 360) % 360)
    }
    var currentFilter by remember(imageUri) { mutableStateOf(initialFilter) }
    var displayQuad by remember(imageUri) {
        mutableStateOf(DocumentEdgeDetector.rotateQuadCW(initialQuad, initialRotationDeg))
    }
    var undoStack by remember(imageUri) { mutableStateOf<List<CropUndoSnapshot>>(emptyList()) }
    var dragStartSnapshot by remember { mutableStateOf<CropUndoSnapshot?>(null) }

    // 0..3 = TL/TR/BR/BL corners; 4..7 = Top/Right/Bottom/Left straight edge bars; -1 = idle
    var activeHandle by remember { mutableIntStateOf(-1) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var displayBitmap by remember(imageUri) { mutableStateOf<Bitmap?>(null) }
    var cornerMap by remember(imageUri) { mutableStateOf<DocumentEdgeDetector.EdgeCornerMap?>(null) }
    // Default OFF for 100% rock-solid placement (zero surprise jumps on release); opt-in via Snap chip
    var magnetSnapEnabled by remember { mutableStateOf(false) }
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
            delay(1600)
            statusBadge = null
        }
    }

    LaunchedEffect(isPreviewMode, selectedAspect) {
        previewZoom = 1f
        previewPan = Offset.Zero
    }

    // 0ms immediate tracking while dragging; crisp 180ms glide on Auto / Rect / Full / Undo
    val animSpec = if (activeHandle >= 0) {
        snap<Float>()
    } else {
        tween<Float>(durationMillis = 180, easing = FastOutSlowInEasing)
    }
    val animTlX by animateFloatAsState(displayQuad.tlX, animSpec, label = "tlX")
    val animTlY by animateFloatAsState(displayQuad.tlY, animSpec, label = "tlY")
    val animTrX by animateFloatAsState(displayQuad.trX, animSpec, label = "trX")
    val animTrY by animateFloatAsState(displayQuad.trY, animSpec, label = "trY")
    val animBrX by animateFloatAsState(displayQuad.brX, animSpec, label = "brX")
    val animBrY by animateFloatAsState(displayQuad.brY, animSpec, label = "brY")
    val animBlX by animateFloatAsState(displayQuad.blX, animSpec, label = "blX")
    val animBlY by animateFloatAsState(displayQuad.blY, animSpec, label = "blY")

    // Decode EXIF-corrected + rotated bitmap once per rotation change
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

    // Render live straightened + shadow-free filtered preview bitmap
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

    val cornerHitPx = with(density) { 54.dp.toPx() }
    val edgeHitPx = with(density) { 38.dp.toPx() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF0A0F1C), Color(0xFF060911), Color(0xFF090E1A))
                    )
                )
                .statusBarsPadding()
                .navigationBarsPadding()
                .testTag("perspective_crop_dialog")
        ) {
            // ─── Executive Top Studio Header ───
            Surface(color = Color(0xFF0E1525), modifier = Modifier.fillMaxWidth()) {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 6.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                            Icon(Icons.Rounded.Close, contentDescription = "Cancel", tint = Color.White)
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Straighten · $pageLabel",
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                softWrap = false,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = when {
                                    isPreviewMode -> "Pinch to zoom · Hold Original to compare"
                                    !isQuadValid -> "Corners cross — drag to fix rectangle"
                                    else -> "Drag blue corners or straight side bars"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (!isPreviewMode && !isQuadValid) Color(0xFFFCA5A5) else Color(0xFF94A3B8),
                                maxLines = 1,
                                softWrap = false,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        if (!isPreviewMode) {
                            Surface(
                                color = if (magnetSnapEnabled) Color(0xFF2563EB).copy(alpha = 0.28f) else Color.White.copy(alpha = 0.08f),
                                shape = RoundedCornerShape(999.dp),
                                modifier = Modifier
                                    .border(
                                        1.dp,
                                        if (magnetSnapEnabled) Color(0xFF60A5FA) else Color.White.copy(alpha = 0.16f),
                                        RoundedCornerShape(999.dp)
                                    )
                                    .clip(RoundedCornerShape(999.dp))
                                    .clickable {
                                        magnetSnapEnabled = !magnetSnapEnabled
                                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        flashStatus(if (magnetSnapEnabled) "Magnetic Snap ON" else "Manual Lock ON")
                                    }
                                    .testTag("crop_snap_toggle_btn")
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Rounded.CenterFocusStrong,
                                        contentDescription = "Toggle Magnetic Snap",
                                        tint = if (magnetSnapEnabled) Color(0xFF60A5FA) else Color(0xFF94A3B8),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = if (magnetSnapEnabled) "Snap" else "Lock",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        softWrap = false
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
                                containerColor = Color(0xFF10B981),
                                contentColor = Color.White,
                                disabledContainerColor = Color(0xFF334155),
                                disabledContentColor = Color(0xFF94A3B8)
                            ),
                            shape = RoundedCornerShape(999.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                            modifier = Modifier.testTag("crop_apply_btn")
                        ) {
                            Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "Done",
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                softWrap = false
                            )
                        }
                    }

                    // ─── Google Docs–style Segmented Mode Switcher ───
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 14.dp, end = 14.dp, bottom = 10.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF172033))
                            .border(1.dp, Color(0xFF25324B), RoundedCornerShape(12.dp))
                            .padding(3.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        StudioModeTab(
                            label = "Adjust Corners",
                            icon = Icons.Rounded.Crop,
                            selected = !isPreviewMode,
                            enabled = true,
                            onClick = {
                                if (isPreviewMode) {
                                    isPreviewMode = false
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            },
                            modifier = Modifier.weight(1f).testTag("crop_mode_adjust_tab")
                        )
                        StudioModeTab(
                            label = "Preview Scan",
                            icon = Icons.Rounded.Visibility,
                            selected = isPreviewMode,
                            enabled = isPreviewMode || isQuadValid,
                            onClick = {
                                if (!isPreviewMode && isQuadValid) {
                                    isPreviewMode = true
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            },
                            modifier = Modifier.weight(1f).testTag("crop_preview_toggle_btn")
                        )
                    }
                    HorizontalDivider(color = Color(0xFF1E293B), thickness = 1.dp)
                }
            }

            // ─── Main Workspace Canvas ───
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 14.dp)
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

                                // 1. Priority: 4 Corner Handles
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

                                // 2. Secondary: 4 Straight Side Edge Bars
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

                                // Do NOT hijack random taps inside image into whole-box moves (rock-solid!)
                                dragStartSnapshot = null
                                activeHandle = -1
                            },
                            onDragEnd = {
                                val released = activeHandle
                                val startSnap = dragStartSnapshot
                                activeHandle = -1
                                dragStartSnapshot = null

                                // Optional Magnetic Snap ONLY when user explicitly toggled Snap ON
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
                                val dx = dragAmount.x / rect.width
                                val dy = dragAmount.y / rect.height

                                when (idx) {
                                    // 4 Corners: 1:1 immediate manual tracking with zero sticking
                                    0 -> displayQuad = q.copy(tlX = (q.tlX + dx).coerceIn(0f, 1f), tlY = (q.tlY + dy).coerceIn(0f, 1f))
                                    1 -> displayQuad = q.copy(trX = (q.trX + dx).coerceIn(0f, 1f), trY = (q.trY + dy).coerceIn(0f, 1f))
                                    2 -> displayQuad = q.copy(brX = (q.brX + dx).coerceIn(0f, 1f), brY = (q.brY + dy).coerceIn(0f, 1f))
                                    3 -> displayQuad = q.copy(blX = (q.blX + dx).coerceIn(0f, 1f), blY = (q.blY + dy).coerceIn(0f, 1f))
                                    // 4 Side Edge Bars: clean parallel-stable margin shift (never twists sideways!)
                                    4 -> { // Top edge
                                        val allowedDy = dy.coerceIn(-minOf(q.tlY, q.trY), 1f - maxOf(q.tlY, q.trY))
                                        val next = q.copy(tlY = q.tlY + allowedDy, trY = q.trY + allowedDy)
                                        if (DocumentEdgeDetector.isConvexForWarp(next)) displayQuad = next
                                    }
                                    5 -> { // Right edge
                                        val allowedDx = dx.coerceIn(-minOf(q.trX, q.brX), 1f - maxOf(q.trX, q.brX))
                                        val next = q.copy(trX = q.trX + allowedDx, brX = q.brX + allowedDx)
                                        if (DocumentEdgeDetector.isConvexForWarp(next)) displayQuad = next
                                    }
                                    6 -> { // Bottom edge
                                        val allowedDy = dy.coerceIn(-minOf(q.blY, q.brY), 1f - maxOf(q.blY, q.brY))
                                        val next = q.copy(blY = q.blY + allowedDy, brY = q.brY + allowedDy)
                                        if (DocumentEdgeDetector.isConvexForWarp(next)) displayQuad = next
                                    }
                                    7 -> { // Left edge
                                        val allowedDx = dx.coerceIn(-minOf(q.tlX, q.blX), 1f - maxOf(q.tlX, q.blX))
                                        val next = q.copy(tlX = q.tlX + allowedDx, blX = q.blX + allowedDx)
                                        if (DocumentEdgeDetector.isConvexForWarp(next)) displayQuad = next
                                    }
                                }
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                if (imageBitmap == null) {
                    CircularProgressIndicator(color = Color(0xFF3B82F6))
                } else if (isPreviewMode) {
                    val activeBmp = if (isHoldingCompareOriginal) imageBitmap else (previewImageBitmap ?: imageBitmap)
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(14.dp))
                            .background(Color(0xFF0E1525))
                            .border(
                                1.5.dp,
                                if (isHoldingCompareOriginal) Color(0xFFF59E0B) else Color(0xFF10B981).copy(alpha = 0.72f),
                                RoundedCornerShape(14.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            bitmap = activeBmp,
                            contentDescription = if (isHoldingCompareOriginal) "Original photo" else "Straightened scan preview",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(6.dp)
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
                            color = Color(0xFF3B82F6),
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    Row(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            color = Color(0xCC090E1A),
                            shape = RoundedCornerShape(999.dp)
                        ) {
                            Text(
                                text = if (isHoldingCompareOriginal) {
                                    "ORIGINAL PHOTO"
                                } else {
                                    val fName = CROP_PREVIEW_FILTERS.firstOrNull { it.first == currentFilter }?.second ?: "Magic"
                                    val zoomSuffix = if (previewZoom > 1.05f) " · ${"%.1f".format(previewZoom)}×" else ""
                                    "RECTIFIED · $fName$zoomSuffix"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isHoldingCompareOriginal) Color(0xFFFBBF24) else Color(0xFF34D399),
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                softWrap = false,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }

                        Surface(
                            color = if (isHoldingCompareOriginal) Color(0xFFF59E0B) else Color(0xCC090E1A),
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
                                    text = "Original",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isHoldingCompareOriginal) Color.Black else Color.White,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false
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
                                activeHandle >= 0 -> Color(0xFF10B981) // Emerald active lock
                                else -> Color(0xFF3B82F6) // Signature Google Docs Scanner electric blue
                            }

                            // 1. EvenOdd darkened scrim outside the selected rectangular region
                            val scrimPath = Path().apply {
                                fillType = PathFillType.EvenOdd
                                addRect(imageRect)
                                moveTo(p0.x, p0.y)
                                lineTo(p1.x, p1.y)
                                lineTo(p2.x, p2.y)
                                lineTo(p3.x, p3.y)
                                close()
                            }
                            drawPath(scrimPath, color = Color.Black.copy(alpha = 0.60f))

                            // 2. Subtle 3×3 perspective alignment grid (always faint, brightens while dragging)
                            if (isQuadValid) {
                                val guideAlpha = if (activeHandle >= 0) 0.42f else 0.14f
                                val guideColor = Color.White.copy(alpha = guideAlpha)
                                for (t in listOf(1f / 3f, 2f / 3f)) {
                                    val topPt = Offset(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t)
                                    val botPt = Offset(p3.x + (p2.x - p3.x) * t, p3.y + (p2.y - p3.y) * t)
                                    drawLine(guideColor, topPt, botPt, strokeWidth = 1.dp.toPx())
                                    val leftPt = Offset(p0.x + (p3.x - p0.x) * t, p0.y + (p3.y - p0.y) * t)
                                    val rightPt = Offset(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t)
                                    drawLine(guideColor, leftPt, rightPt, strokeWidth = 1.dp.toPx())
                                }
                            }

                            // 3. Crisp Google Docs Scanner border polygon with subtle dark contrast halo
                            val poly = Path().apply {
                                moveTo(p0.x, p0.y)
                                lineTo(p1.x, p1.y)
                                lineTo(p2.x, p2.y)
                                lineTo(p3.x, p3.y)
                                close()
                            }
                            drawPath(poly, color = Color.Black.copy(alpha = 0.52f), style = Stroke(width = 4.6.dp.toPx()))
                            drawPath(poly, color = accentColor, style = Stroke(width = 2.4.dp.toPx()))

                            // 4. Rotated capsule side-edge handles along each edge midpoint
                            val edges = listOf(p0 to p1, p1 to p2, p2 to p3, p3 to p0)
                            val barHalfLen = 15.dp.toPx()
                            edges.forEachIndexed { eIdx, (a, b) ->
                                val edgeLen = hypot((b.x - a.x).toDouble(), (b.y - a.y).toDouble()).toFloat()
                                if (edgeLen > barHalfLen * 2.6f) {
                                    val ux = (b.x - a.x) / edgeLen
                                    val uy = (b.y - a.y) / edgeLen
                                    val mid = Offset((a.x + b.x) / 2f, (a.y + b.y) / 2f)
                                    val barStart = Offset(mid.x - ux * barHalfLen, mid.y - uy * barHalfLen)
                                    val barEnd = Offset(mid.x + ux * barHalfLen, mid.y + uy * barHalfLen)
                                    val isEdgeActive = activeHandle == 4 + eIdx
                                    drawLine(
                                        color = Color.Black.copy(alpha = 0.60f),
                                        start = barStart,
                                        end = barEnd,
                                        strokeWidth = (if (isEdgeActive) 9.dp else 7.dp).toPx(),
                                        cap = StrokeCap.Round
                                    )
                                    drawLine(
                                        color = when {
                                            !isQuadValid -> Color(0xFFFCA5A5)
                                            isEdgeActive -> Color(0xFF34D399)
                                            else -> Color.White
                                        },
                                        start = barStart,
                                        end = barEnd,
                                        strokeWidth = (if (isEdgeActive) 5.5.dp else 4.2.dp).toPx(),
                                        cap = StrokeCap.Round
                                    )
                                }
                            }

                            // 5. Crisp Google Docs Scanner corner drag knobs (transparent target crosshair while grabbed)
                            val corners = listOf(p0, p1, p2, p3)
                            corners.forEachIndexed { idx, pt ->
                                val isSelected = activeHandle == idx
                                if (isSelected) {
                                    drawCircle(color = accentColor.copy(alpha = 0.24f), radius = 24.dp.toPx(), center = pt)
                                    drawCircle(color = Color.White, radius = 15.dp.toPx(), center = pt, style = Stroke(width = 2.6.dp.toPx()))
                                    val arm = 8.dp.toPx()
                                    drawLine(accentColor, Offset(pt.x - arm, pt.y), Offset(pt.x + arm, pt.y), strokeWidth = 1.6.dp.toPx())
                                    drawLine(accentColor, Offset(pt.x, pt.y - arm), Offset(pt.x, pt.y + arm), strokeWidth = 1.6.dp.toPx())
                                } else {
                                    drawCircle(color = Color.Black.copy(alpha = 0.45f), radius = 14.5.dp.toPx(), center = pt)
                                    drawCircle(color = Color.White, radius = 11.5.dp.toPx(), center = pt)
                                    drawCircle(color = accentColor, radius = 8.dp.toPx(), center = pt, style = Stroke(width = 2.4.dp.toPx()))
                                    drawCircle(color = accentColor, radius = 3.2.dp.toPx(), center = pt)
                                }
                            }

                            // 6. Rock-Steady Opposite-Corner 3.5× Magnifier Loupe (NEVER jumps/teleports over sheet!)
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

                                val loupeR = 62.dp.toPx()
                                val margin = 10.dp.toPx()
                                // Fixed calmly in opposite top corner away from the active handle
                                val isLeftHandle = activeHandle == 0 || activeHandle == 3
                                val loupeCx = if (isLeftHandle) size.width - loupeR - margin else loupeR + margin
                                val loupeCy = loupeR + margin
                                val loupeRect = Rect(loupeCx - loupeR, loupeCy - loupeR, loupeCx + loupeR, loupeCy + loupeR)
                                val loupeClip = Path().apply { addOval(loupeRect) }

                                val bmpW = imageBitmap.width
                                val bmpH = imageBitmap.height
                                val sampleSpan = (minOf(bmpW, bmpH) * 0.105f).roundToInt().coerceIn(36, 210)
                                val halfSpan = sampleSpan / 2
                                val srcCx = normX * bmpW
                                val srcCy = normY * bmpH
                                val srcLeft = (srcCx.roundToInt() - halfSpan).coerceIn(0, (bmpW - sampleSpan).coerceAtLeast(0))
                                val srcTop = (srcCy.roundToInt() - halfSpan).coerceIn(0, (bmpH - sampleSpan).coerceAtLeast(0))
                                val actualW = sampleSpan.coerceAtMost(bmpW - srcLeft).coerceAtLeast(1)
                                val actualH = sampleSpan.coerceAtMost(bmpH - srcTop).coerceAtLeast(1)

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

                                    drawLine(Color.Black.copy(alpha = 0.60f), vCenter, vPrev, strokeWidth = 4.dp.toPx())
                                    drawLine(Color.Black.copy(alpha = 0.60f), vCenter, vNext, strokeWidth = 4.dp.toPx())
                                    drawLine(accentColor, vCenter, vPrev, strokeWidth = 2.2.dp.toPx())
                                    drawLine(accentColor, vCenter, vNext, strokeWidth = 2.2.dp.toPx())

                                    val arm = 18.dp.toPx()
                                    val gap = 4.5.dp.toPx()
                                    drawLine(Color.White, Offset(vCenter.x - arm, vCenter.y), Offset(vCenter.x - gap, vCenter.y), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x + gap, vCenter.y), Offset(vCenter.x + arm, vCenter.y), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x, vCenter.y - arm), Offset(vCenter.x, vCenter.y - gap), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x, vCenter.y + gap), Offset(vCenter.x, vCenter.y + arm), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawCircle(accentColor, radius = 3.2.dp.toPx(), center = vCenter)
                                }
                                drawCircle(color = Color.White, radius = loupeR, center = Offset(loupeCx, loupeCy), style = Stroke(width = 3.dp.toPx()))
                                drawCircle(color = accentColor, radius = loupeR - 2.dp.toPx(), center = Offset(loupeCx, loupeCy), style = Stroke(width = 1.4.dp.toPx()))
                            }
                        }
                    }

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
                                Icon(Icons.Rounded.WarningAmber, contentDescription = null, tint = Color(0xFFFECACA), modifier = Modifier.size(16.dp))
                                Text(
                                    text = "Adjust corners to form a valid rectangle",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false
                                )
                            }
                        }
                    }
                }

                androidx.compose.animation.AnimatedVisibility(
                    visible = statusBadge != null && isQuadValid,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp)
                ) {
                    statusBadge?.let { msg ->
                        Surface(
                            color = Color(0xE00F172A),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier.border(1.dp, Color(0xFF3B82F6).copy(alpha = 0.55f), RoundedCornerShape(999.dp))
                        ) {
                            Text(
                                text = msg,
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                softWrap = false,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }

            // ─── Bottom Studio Action Dock (Vertical Icon-Above-Label = ZERO Wrapping!) ───
            Surface(
                color = Color(0xFF0E1525),
                shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
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
                                        label = {
                                            Text(
                                                text = label,
                                                style = MaterialTheme.typography.labelMedium,
                                                maxLines = 1,
                                                softWrap = false
                                            )
                                        },
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
                                        label = {
                                            Text(
                                                text = preset.label,
                                                style = MaterialTheme.typography.labelSmall,
                                                maxLines = 1,
                                                softWrap = false
                                            )
                                        },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFF0EA5E9).copy(alpha = 0.28f),
                                            selectedLabelColor = Color(0xFF7DD3FC),
                                            containerColor = Color.White.copy(alpha = 0.06f),
                                            labelColor = Color(0xFF94A3B8)
                                        )
                                    )
                                }
                            }
                        }
                    }

                    // 5 Sleek Icon-Above-Label Pro Tools (Guaranteed single-line on all widths!)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        StudioToolTile(
                            icon = Icons.Rounded.AutoFixHigh,
                            label = if (isDetecting) "Wait" else "Auto",
                            iconTint = Color(0xFF60A5FA),
                            enabled = !isDetecting && displayBitmap != null,
                            onClick = {
                                val bmp = displayBitmap ?: return@StudioToolTile
                                scope.launch {
                                    isDetecting = true
                                    isPreviewMode = false
                                    pushUndo()
                                    val detected = withContext(Dispatchers.Default) {
                                        DocumentEdgeDetector.detectFromBitmapOrNull(bmp)
                                    }
                                    if (detected != null) {
                                        displayQuad = detected
                                        flashStatus("Document corners detected")
                                    } else {
                                        displayQuad = NormalizedQuad.FULL
                                        flashStatus("No sharp edge found — adjust manually")
                                    }
                                    isDetecting = false
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            },
                            modifier = Modifier.weight(1f).testTag("crop_auto_detect_btn")
                        )

                        StudioToolTile(
                            icon = Icons.Rounded.CropSquare,
                            label = "Rect",
                            iconTint = Color(0xFF34D399),
                            enabled = true,
                            onClick = {
                                isPreviewMode = false
                                pushUndo()
                                displayQuad = DocumentEdgeDetector.squareUpQuadToRectangle(displayQuad)
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                flashStatus("Squared to clean 90° rectangle")
                            },
                            modifier = Modifier.weight(1f).testTag("crop_square_rect_btn")
                        )

                        StudioToolTile(
                            icon = Icons.Rounded.CropFree,
                            label = "Full",
                            iconTint = Color(0xFFE2E8F0),
                            enabled = true,
                            onClick = {
                                isPreviewMode = false
                                pushUndo()
                                displayQuad = NormalizedQuad.FULL
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                flashStatus("Reset to Full Frame")
                            },
                            modifier = Modifier.weight(1f).testTag("crop_full_frame_btn")
                        )

                        StudioToolTile(
                            icon = Icons.AutoMirrored.Rounded.RotateRight,
                            label = "Rotate",
                            iconTint = Color(0xFFFBBF24),
                            enabled = true,
                            onClick = {
                                isPreviewMode = false
                                pushUndo()
                                currentRotation = (currentRotation + 90) % 360
                                displayQuad = DocumentEdgeDetector.rotateQuadCW(displayQuad, 90)
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            },
                            modifier = Modifier.weight(1f).testTag("crop_rotate_btn")
                        )

                        StudioToolTile(
                            icon = Icons.AutoMirrored.Rounded.Undo,
                            label = "Undo",
                            iconTint = if (undoStack.isNotEmpty()) Color(0xFFF8FAFC) else Color(0xFF475569),
                            enabled = undoStack.isNotEmpty(),
                            onClick = {
                                val prev = undoStack.lastOrNull() ?: return@StudioToolTile
                                undoStack = undoStack.dropLast(1)
                                currentRotation = prev.rotationDeg
                                displayQuad = prev.quad
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                flashStatus("Undid last change")
                            },
                            modifier = Modifier.weight(1f).testTag("crop_undo_btn")
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StudioModeTab(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = if (selected) Color(0xFF2563EB) else Color.Transparent,
        shape = RoundedCornerShape(9.dp),
        modifier = modifier
            .height(38.dp)
            .clip(RoundedCornerShape(9.dp))
            .clickable(enabled = enabled, onClick = onClick)
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = when {
                    selected -> Color.White
                    enabled -> Color(0xFF94A3B8)
                    else -> Color(0xFF475569)
                },
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(5.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = when {
                    selected -> Color.White
                    enabled -> Color(0xFFCBD5E1)
                    else -> Color(0xFF475569)
                },
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun StudioToolTile(
    icon: ImageVector,
    label: String,
    iconTint: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = if (enabled) Color(0xFF172033) else Color(0xFF0F1624),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier
            .height(58.dp)
            .border(1.dp, if (enabled) Color(0xFF25324B) else Color(0xFF1A2233), RoundedCornerShape(14.dp))
            .clip(RoundedCornerShape(14.dp))
            .clickable(enabled = enabled, onClick = onClick)
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(vertical = 6.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (enabled) iconTint else Color(0xFF475569),
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = if (enabled) Color(0xFFE2E8F0) else Color(0xFF64748B),
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip
            )
        }
    }
}
