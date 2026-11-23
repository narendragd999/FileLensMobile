package com.filelenspro.app.ui.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.CenterFocusStrong
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Crop
import androidx.compose.material.icons.rounded.CropFree
import androidx.compose.material.icons.rounded.Visibility
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

/**
 * Genius Scan / Google Docs Scanner–class Interactive 4-Corner Perspective Straightener:
 * - Zero-jump relative delta dragging on all 4 corners, 4 angled capsule edge bars, and whole-quad pan
 * - 3.0× precision circular Magnifier Loupe with live converging polygon edge rays & pixel crosshair
 * - Optional Harris-based Magnetic Corner Snap (locks corners cleanly onto crisp paper vertices)
 * - Zhang & He projective aspect-ratio recovery + Matrix.setPolyToPoly homography live Preview
 * - Press-and-hold Original vs Straightened comparison + instant scan filter switching in Preview
 * - Instant RGB+Luma Auto Detect, Full Frame reset, and synchronized Rotate 90°
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
    var statusBadge by remember { mutableStateOf<String?>(null) }
    var statusBadgeKey by remember { mutableIntStateOf(0) }

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

    // Render live straightened + filtered preview bitmap when Preview mode is active
    LaunchedEffect(isPreviewMode, displayQuad, currentRotation, currentFilter) {
        if (isPreviewMode) {
            isRenderingPreview = true
            val unrotatedQuad = DocumentEdgeDetector.rotateQuadInverse(displayQuad, currentRotation)
            val rendered = engine.renderPagePreviewBitmap(
                uriString = imageUri.toString(),
                quad = unrotatedQuad,
                filter = currentFilter,
                rotationDeg = currentRotation,
                maxDim = 1280
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
    val latestRect by rememberUpdatedState(imageRect)
    val latestPreviewMode by rememberUpdatedState(isPreviewMode)
    val latestCornerMap by rememberUpdatedState(cornerMap)
    val latestMagnetSnap by rememberUpdatedState(magnetSnapEnabled)

    val cornerHitPx = with(density) { 56.dp.toPx() }
    val edgeHitPx = with(density) { 38.dp.toPx() }

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
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = "Cancel Straightening", tint = Color.White)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Straighten · $pageLabel",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = if (isPreviewMode) "Hold image to compare Original"
                        else "Drag corners, edge bars, or inside frame",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF94A3B8)
                    )
                }
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
                                flashStatus(if (magnetSnapEnabled) "Magnetic Corner Snap ON" else "Freehand Manual Mode")
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
                    onClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        val unrotated = DocumentEdgeDetector.rotateQuadInverse(displayQuad, currentRotation)
                        onApply(unrotated, currentRotation, currentFilter)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
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
                            detectTapGestures(
                                onPress = {
                                    isHoldingCompareOriginal = true
                                    tryAwaitRelease()
                                    isHoldingCompareOriginal = false
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
                                    activeHandle = bestCorner
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    return@detectDragGestures
                                }

                                // 2. Secondary: 4 edge midpoint capsule bars
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
                                    activeHandle = bestEdge
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    return@detectDragGestures
                                }

                                // 3. Tertiary: Inside polygon pan (only if not full frame)
                                if (!q.isFullFrame() && isPointInQuad(startPos, p0, p1, p2, p3)) {
                                    activeHandle = 8
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                } else {
                                    activeHandle = -1
                                }
                            },
                            onDragEnd = {
                                val released = activeHandle
                                activeHandle = -1
                                // Subtle Genius Scan-style magnetic corner snap on release
                                val map = latestCornerMap
                                if (latestMagnetSnap && map != null && released in 0..3) {
                                    val q = latestQuad
                                    val (curX, curY) = when (released) {
                                        0 -> q.tlX to q.tlY
                                        1 -> q.trX to q.trY
                                        2 -> q.brX to q.brY
                                        else -> q.blX to q.blY
                                    }
                                    val (sx, sy) = DocumentEdgeDetector.snapCornerToEdge(curX, curY, map)
                                    if (sx != curX || sy != curY) {
                                        val snapped = when (released) {
                                            0 -> q.copy(tlX = sx, tlY = sy)
                                            1 -> q.copy(trX = sx, trY = sy)
                                            2 -> q.copy(brX = sx, brY = sy)
                                            else -> q.copy(blX = sx, blY = sy)
                                        }
                                        if (DocumentEdgeDetector.isConvexForWarp(snapped)) {
                                            displayQuad = snapped
                                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        }
                                    }
                                }
                            },
                            onDragCancel = { activeHandle = -1 },
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

                                val candidate = when (idx) {
                                    0 -> q.copy(tlX = (q.tlX + dx).coerceIn(0f, 1f), tlY = (q.tlY + dy).coerceIn(0f, 1f))
                                    1 -> q.copy(trX = (q.trX + dx).coerceIn(0f, 1f), trY = (q.trY + dy).coerceIn(0f, 1f))
                                    2 -> q.copy(brX = (q.brX + dx).coerceIn(0f, 1f), brY = (q.brY + dy).coerceIn(0f, 1f))
                                    3 -> q.copy(blX = (q.blX + dx).coerceIn(0f, 1f), blY = (q.blY + dy).coerceIn(0f, 1f))
                                    4 -> { // Top edge bar
                                        val allowedDy = dy.coerceIn(-minOf(q.tlY, q.trY), 1f - maxOf(q.tlY, q.trY))
                                        q.copy(tlY = q.tlY + allowedDy, trY = q.trY + allowedDy)
                                    }
                                    5 -> { // Right edge bar
                                        val allowedDx = dx.coerceIn(-minOf(q.trX, q.brX), 1f - maxOf(q.trX, q.brX))
                                        q.copy(trX = q.trX + allowedDx, brX = q.brX + allowedDx)
                                    }
                                    6 -> { // Bottom edge bar
                                        val allowedDy = dy.coerceIn(-minOf(q.blY, q.brY), 1f - maxOf(q.blY, q.brY))
                                        q.copy(blY = q.blY + allowedDy, brY = q.brY + allowedDy)
                                    }
                                    7 -> { // Left edge bar
                                        val allowedDx = dx.coerceIn(-minOf(q.tlX, q.blX), 1f - maxOf(q.tlX, q.blX))
                                        q.copy(tlX = q.tlX + allowedDx, blX = q.blX + allowedDx)
                                    }
                                    else -> { // Whole-quad smooth pan
                                        val minX = minOf(q.tlX, q.trX, q.brX, q.blX)
                                        val maxX = maxOf(q.tlX, q.trX, q.brX, q.blX)
                                        val minY = minOf(q.tlY, q.trY, q.brY, q.blY)
                                        val maxY = maxOf(q.tlY, q.trY, q.brY, q.blY)
                                        val clDx = dx.coerceIn(-minX, 1f - maxX)
                                        val clDy = dy.coerceIn(-minY, 1f - maxY)
                                        q.copy(
                                            tlX = q.tlX + clDx, tlY = q.tlY + clDy,
                                            trX = q.trX + clDx, trY = q.trY + clDy,
                                            brX = q.brX + clDx, brY = q.brY + clDy,
                                            blX = q.blX + clDx, blY = q.blY + clDy
                                        )
                                    }
                                }
                                if (DocumentEdgeDetector.isConvexForWarp(candidate)) {
                                    displayQuad = candidate
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
                    Image(
                        bitmap = activeBmp,
                        contentDescription = if (isHoldingCompareOriginal) "Original photo" else "Straightened scan preview",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(10.dp))
                            .border(
                                1.5.dp,
                                if (isHoldingCompareOriginal) Color(0xFFF59E0B) else Color(0xFF22C55E).copy(alpha = 0.7f),
                                RoundedCornerShape(10.dp)
                            )
                    )
                    if (isRenderingPreview) {
                        CircularProgressIndicator(
                            color = Color(0xFF38BDF8),
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(34.dp)
                        )
                    }
                    Surface(
                        color = Color.Black.copy(alpha = 0.72f),
                        shape = RoundedCornerShape(999.dp),
                        modifier = Modifier.align(Alignment.TopCenter).padding(top = 8.dp)
                    ) {
                        Text(
                            text = if (isHoldingCompareOriginal) "ORIGINAL PHOTO" else "STRAIGHTENED · ${CROP_PREVIEW_FILTERS.firstOrNull { it.first == currentFilter }?.second ?: "Magic"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isHoldingCompareOriginal) Color(0xFFFBBF24) else Color(0xFF4ADE80),
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                        )
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
                            val p0 = Offset(imageRect.left + displayQuad.tlX * imageRect.width, imageRect.top + displayQuad.tlY * imageRect.height)
                            val p1 = Offset(imageRect.left + displayQuad.trX * imageRect.width, imageRect.top + displayQuad.trY * imageRect.height)
                            val p2 = Offset(imageRect.left + displayQuad.brX * imageRect.width, imageRect.top + displayQuad.brY * imageRect.height)
                            val p3 = Offset(imageRect.left + displayQuad.blX * imageRect.width, imageRect.top + displayQuad.blY * imageRect.height)

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
                            if (activeHandle >= 0) {
                                val guideColor = Color.White.copy(alpha = 0.34f)
                                for (t in listOf(1f / 3f, 2f / 3f)) {
                                    val topPt = Offset(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t)
                                    val botPt = Offset(p3.x + (p2.x - p3.x) * t, p3.y + (p2.y - p3.y) * t)
                                    drawLine(guideColor, topPt, botPt, strokeWidth = 1.dp.toPx())
                                    val leftPt = Offset(p0.x + (p3.x - p0.x) * t, p0.y + (p3.y - p0.y) * t)
                                    val rightPt = Offset(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t)
                                    drawLine(guideColor, leftPt, rightPt, strokeWidth = 1.dp.toPx())
                                }
                            }

                            // 3. Crisp Google Docs / Genius Scan border polygon with subtle outer shadow
                            val accentColor = if (activeHandle >= 0) Color(0xFF4ADE80) else Color(0xFF38BDF8)
                            val poly = Path().apply {
                                moveTo(p0.x, p0.y)
                                lineTo(p1.x, p1.y)
                                lineTo(p2.x, p2.y)
                                lineTo(p3.x, p3.y)
                                close()
                            }
                            drawPath(poly, color = Color.Black.copy(alpha = 0.45f), style = Stroke(width = 4.5.dp.toPx()))
                            drawPath(poly, color = accentColor, style = Stroke(width = 2.4.dp.toPx()))

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
                                        color = if (isEdgeActive) Color(0xFF4ADE80) else Color.White,
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
                                    // Transparent target ring + fine crosshair right over the corner
                                    drawCircle(
                                        color = Color(0xFF22C55E).copy(alpha = 0.22f),
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
                                    drawLine(Color(0xFF4ADE80), Offset(pt.x - arm, pt.y), Offset(pt.x + arm, pt.y), strokeWidth = 1.6.dp.toPx())
                                    drawLine(Color(0xFF4ADE80), Offset(pt.x, pt.y - arm), Offset(pt.x, pt.y + arm), strokeWidth = 1.6.dp.toPx())
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
                                        color = Color(0xFF38BDF8),
                                        radius = 4.dp.toPx(),
                                        center = pt
                                    )
                                }
                            }

                            // 6. Signature Genius Scan / Google Docs 3.0× Magnifier Loupe
                            //    with LIVE CONVERGING POLYGON BORDER RAYS drawn inside the zoomed circle!
                            if (activeHandle in 0..3) {
                                val normPts = listOf(
                                    displayQuad.tlX to displayQuad.tlY,
                                    displayQuad.trX to displayQuad.trY,
                                    displayQuad.brX to displayQuad.brY,
                                    displayQuad.blX to displayQuad.blY
                                )
                                val (normX, normY) = normPts[activeHandle]
                                val prevNorm = normPts[(activeHandle + 3) % 4]
                                val nextNorm = normPts[(activeHandle + 1) % 4]

                                val loupeR = 62.dp.toPx()
                                val margin = 10.dp.toPx()
                                // Position cleanly in opposite top corner so thumb NEVER obscures magnifier
                                val loupeCx = if (normX < 0.52f) size.width - loupeR - margin else loupeR + margin
                                val loupeCy = loupeR + margin
                                val loupeRect = Rect(loupeCx - loupeR, loupeCy - loupeR, loupeCx + loupeR, loupeCy + loupeR)
                                val loupeClip = Path().apply { addOval(loupeRect) }

                                val bmpW = imageBitmap.width
                                val bmpH = imageBitmap.height
                                // 3.0x optical magnification window (13% of shortest side)
                                val sampleSpan = (minOf(bmpW, bmpH) * 0.13f).roundToInt().coerceIn(40, 240)
                                val halfSpan = sampleSpan / 2
                                val srcCx = normX * bmpW
                                val srcCy = normY * bmpH
                                val srcLeft = (srcCx.roundToInt() - halfSpan).coerceIn(0, (bmpW - sampleSpan).coerceAtLeast(0))
                                val srcTop = (srcCy.roundToInt() - halfSpan).coerceIn(0, (bmpH - sampleSpan).coerceAtLeast(0))
                                val actualW = sampleSpan.coerceAtMost(bmpW - srcLeft).coerceAtLeast(1)
                                val actualH = sampleSpan.coerceAtMost(bmpH - srcTop).coerceAtLeast(1)

                                // Elevated shadow halo
                                drawCircle(color = Color.Black.copy(alpha = 0.65f), radius = loupeR + 5.dp.toPx(), center = Offset(loupeCx, loupeCy))
                                clipPath(loupeClip) {
                                    drawRect(color = Color(0xFF0A0F1C), topLeft = loupeRect.topLeft, size = loupeRect.size)
                                    drawImage(
                                        image = imageBitmap,
                                        srcOffset = IntOffset(srcLeft, srcTop),
                                        srcSize = IntSize(actualW, actualH),
                                        dstOffset = IntOffset(loupeRect.left.roundToInt(), loupeRect.top.roundToInt()),
                                        dstSize = IntSize((loupeR * 2f).roundToInt(), (loupeR * 2f).roundToInt())
                                    )

                                    // Project the exact corner and its two adjacent edges into loupe coordinates
                                    fun bmpToLoupe(bx: Float, by: Float): Offset {
                                        val rx = (bx - srcLeft) / actualW.toFloat()
                                        val ry = (by - srcTop) / actualH.toFloat()
                                        return Offset(loupeRect.left + rx * loupeRect.width, loupeRect.top + ry * loupeRect.height)
                                    }

                                    val vCenter = bmpToLoupe(srcCx, srcCy)
                                    val vPrev = bmpToLoupe(prevNorm.first * bmpW, prevNorm.second * bmpH)
                                    val vNext = bmpToLoupe(nextNorm.first * bmpW, nextNorm.second * bmpH)

                                    // Draw live converging polygon border lines right inside the 3x magnifier!
                                    drawLine(Color.Black.copy(alpha = 0.55f), vCenter, vPrev, strokeWidth = 4.dp.toPx())
                                    drawLine(Color.Black.copy(alpha = 0.55f), vCenter, vNext, strokeWidth = 4.dp.toPx())
                                    drawLine(Color(0xFF4ADE80), vCenter, vPrev, strokeWidth = 2.2.dp.toPx())
                                    drawLine(Color(0xFF4ADE80), vCenter, vNext, strokeWidth = 2.2.dp.toPx())

                                    // Fine precision crosshair centered on the exact corner vertex
                                    val arm = 16.dp.toPx()
                                    val gap = 4.dp.toPx()
                                    drawLine(Color.White, Offset(vCenter.x - arm, vCenter.y), Offset(vCenter.x - gap, vCenter.y), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x + gap, vCenter.y), Offset(vCenter.x + arm, vCenter.y), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x, vCenter.y - arm), Offset(vCenter.x, vCenter.y - gap), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawLine(Color.White, Offset(vCenter.x, vCenter.y + gap), Offset(vCenter.x, vCenter.y + arm), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
                                    drawCircle(Color(0xFF22C55E), radius = 3.dp.toPx(), center = vCenter)
                                }
                                drawCircle(
                                    color = Color.White,
                                    radius = loupeR,
                                    center = Offset(loupeCx, loupeCy),
                                    style = Stroke(width = 3.dp.toPx())
                                )
                                drawCircle(
                                    color = Color(0xFF38BDF8),
                                    radius = loupeR - 2.dp.toPx(),
                                    center = Offset(loupeCx, loupeCy),
                                    style = Stroke(width = 1.2.dp.toPx())
                                )
                            }
                        }
                    }
                }

                // Floating micro-status feedback pill (e.g., "Edges detected", "Snap ON")
                androidx.compose.animation.AnimatedVisibility(
                    visible = statusBadge != null,
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
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Live Filter Strip inside Preview mode
                    AnimatedVisibility(visible = isPreviewMode) {
                        Row(
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CROP_PREVIEW_FILTERS.forEach { (id, label) ->
                                FilterChip(
                                    selected = currentFilter == id,
                                    onClick = { currentFilter = id },
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
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Auto Detect (RGB desk-color + Luma + Convex Hull)
                        OutlinedButton(
                            enabled = !isDetecting && displayBitmap != null,
                            onClick = {
                                val bmp = displayBitmap ?: return@OutlinedButton
                                scope.launch {
                                    isDetecting = true
                                    isPreviewMode = false
                                    val detected = withContext(Dispatchers.Default) {
                                        DocumentEdgeDetector.detectFromBitmapOrNull(bmp)
                                    }
                                    if (detected != null) {
                                        displayQuad = detected
                                        flashStatus("Document edges locked")
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
                            color = if (isPreviewMode) Color(0xFF2563EB) else Color.White.copy(alpha = 0.14f),
                            shape = RoundedCornerShape(999.dp),
                            modifier = Modifier
                                .weight(1.15f)
                                .height(42.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .clickable {
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
                                    tint = Color.White,
                                    modifier = Modifier.size(17.dp)
                                )
                                Spacer(Modifier.width(5.dp))
                                Text(
                                    if (isPreviewMode) "Edit" else "Preview",
                                    color = Color.White,
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
