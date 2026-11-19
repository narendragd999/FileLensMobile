package com.filelenspro.app.ui.components

import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CropFree
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.service.OcrAndPdfEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.hypot

/**
 * Interactive 4-corner perspective cropper (Genius Scan–style) allowing users to drag
 * Top-Left, Top-Right, Bottom-Right, and Bottom-Left corners precisely onto document edges,
 * or run one-tap Auto Detect / Full Frame reset.
 */
@Composable
fun PerspectiveCropDialog(
    imageUri: Uri,
    pageLabel: String,
    initialQuad: NormalizedQuad,
    engine: OcrAndPdfEngine,
    onDismiss: () -> Unit,
    onApply: (NormalizedQuad) -> Unit
) {
    val scope = rememberCoroutineScope()
    var quad by remember(initialQuad) { mutableStateOf(initialQuad) }
    var activeCorner by remember { mutableIntStateOf(-1) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var imageDims by remember(imageUri) { mutableStateOf(1000 to 1400) }
    var isDetecting by remember { mutableStateOf(false) }

    LaunchedEffect(imageUri) {
        val dims = withContext(Dispatchers.IO) { engine.readImageDimensions(imageUri.toString()) }
        if (dims.first > 0 && dims.second > 0) {
            imageDims = dims
        }
    }

    // Compute exact displayed image rect inside container with ContentScale.Fit
    val imageRect = remember(containerSize, imageDims) {
        if (containerSize.width <= 0 || containerSize.height <= 0) {
            Rect.Zero
        } else {
            val cw = containerSize.width.toFloat()
            val ch = containerSize.height.toFloat()
            val iw = imageDims.first.toFloat().coerceAtLeast(1f)
            val ih = imageDims.second.toFloat().coerceAtLeast(1f)
            val scale = minOf(cw / iw, ch / ih)
            val rw = iw * scale
            val rh = ih * scale
            val left = (cw - rw) / 2f
            val top = (ch - rh) / 2f
            Rect(left, top, left + rw, top + rh)
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF090D16))
                .statusBarsPadding()
                .navigationBarsPadding()
                .testTag("perspective_crop_dialog")
        ) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = "Cancel Crop", tint = Color.White)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Perspective Crop · $pageLabel",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Drag any corner to straighten angled pages",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.72f)
                    )
                }
                Button(
                    onClick = { onApply(quad) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF22C55E)),
                    modifier = Modifier.testTag("crop_apply_btn")
                ) {
                    Icon(Icons.Rounded.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Apply")
                }
            }

            // Interactive Crop Canvas
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(16.dp)
                    .onSizeChanged { containerSize = it }
                    .pointerInput(imageRect) {
                        detectDragGestures(
                            onDragStart = { startPos ->
                                if (imageRect.width <= 1f || imageRect.height <= 1f) return@detectDragGestures
                                val pts = listOf(
                                    Offset(imageRect.left + quad.tlX * imageRect.width, imageRect.top + quad.tlY * imageRect.height),
                                    Offset(imageRect.left + quad.trX * imageRect.width, imageRect.top + quad.trY * imageRect.height),
                                    Offset(imageRect.left + quad.brX * imageRect.width, imageRect.top + quad.brY * imageRect.height),
                                    Offset(imageRect.left + quad.blX * imageRect.width, imageRect.top + quad.blY * imageRect.height)
                                )
                                var bestIdx = -1
                                var bestDist = Float.MAX_VALUE
                                pts.forEachIndexed { idx, p ->
                                    val d = hypot(p.x - startPos.x, p.y - startPos.y)
                                    if (d < bestDist) {
                                        bestDist = d
                                        bestIdx = idx
                                    }
                                }
                                activeCorner = if (bestDist <= 140f) bestIdx else -1
                            },
                            onDragEnd = { activeCorner = -1 },
                            onDragCancel = { activeCorner = -1 },
                            onDrag = { change, _ ->
                                val idx = activeCorner
                                if (idx < 0 || imageRect.width <= 1f || imageRect.height <= 1f) return@detectDragGestures
                                change.consume()
                                val nx = ((change.position.x - imageRect.left) / imageRect.width).coerceIn(0f, 1f)
                                val ny = ((change.position.y - imageRect.top) / imageRect.height).coerceIn(0f, 1f)
                                quad = when (idx) {
                                    0 -> quad.copy(
                                        tlX = nx.coerceAtMost(quad.trX - 0.08f),
                                        tlY = ny.coerceAtMost(quad.blY - 0.08f)
                                    )
                                    1 -> quad.copy(
                                        trX = nx.coerceAtLeast(quad.tlX + 0.08f),
                                        trY = ny.coerceAtMost(quad.brY - 0.08f)
                                    )
                                    2 -> quad.copy(
                                        brX = nx.coerceAtLeast(quad.blX + 0.08f),
                                        brY = ny.coerceAtLeast(quad.trY + 0.08f)
                                    )
                                    else -> quad.copy(
                                        blX = nx.coerceAtMost(quad.brX - 0.08f),
                                        blY = ny.coerceAtLeast(quad.tlY + 0.08f)
                                    )
                                }
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                AsyncImage(
                    model = imageUri,
                    contentDescription = "Page to crop",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize()
                )

                if (imageRect.width > 1f && imageRect.height > 1f) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        val p0 = Offset(imageRect.left + quad.tlX * imageRect.width, imageRect.top + quad.tlY * imageRect.height)
                        val p1 = Offset(imageRect.left + quad.trX * imageRect.width, imageRect.top + quad.trY * imageRect.height)
                        val p2 = Offset(imageRect.left + quad.brX * imageRect.width, imageRect.top + quad.brY * imageRect.height)
                        val p3 = Offset(imageRect.left + quad.blX * imageRect.width, imageRect.top + quad.blY * imageRect.height)

                        val poly = Path().apply {
                            moveTo(p0.x, p0.y)
                            lineTo(p1.x, p1.y)
                            lineTo(p2.x, p2.y)
                            lineTo(p3.x, p3.y)
                            close()
                        }
                        drawPath(poly, color = Color(0xFF38BDF8).copy(alpha = 0.16f))
                        drawPath(poly, color = Color(0xFF38BDF8), style = Stroke(width = 3.dp.toPx()))

                        // Mid-edge visual guides for precise alignment
                        listOf(
                            Offset((p0.x + p1.x) / 2f, (p0.y + p1.y) / 2f),
                            Offset((p1.x + p2.x) / 2f, (p1.y + p2.y) / 2f),
                            Offset((p2.x + p3.x) / 2f, (p2.y + p3.y) / 2f),
                            Offset((p3.x + p0.x) / 2f, (p3.y + p0.y) / 2f)
                        ).forEach { mid ->
                            drawCircle(color = Color(0xFF38BDF8), radius = 4.dp.toPx(), center = mid)
                        }

                        listOf(p0, p1, p2, p3).forEachIndexed { idx, pt ->
                            val isSelected = activeCorner == idx
                            val outerR = if (isSelected) 22.dp.toPx() else 14.dp.toPx()
                            drawCircle(
                                color = if (isSelected) Color(0xFF22C55E).copy(alpha = 0.35f) else Color(0xFF38BDF8).copy(alpha = 0.25f),
                                radius = outerR,
                                center = pt
                            )
                            drawCircle(color = Color.White, radius = 9.dp.toPx(), center = pt)
                            drawCircle(
                                color = if (isSelected) Color(0xFF22C55E) else Color(0xFF2563EB),
                                radius = 6.dp.toPx(),
                                center = pt
                            )
                        }
                    }
                }
            }

            // Bottom quick tools
            Surface(
                color = Color(0xFF111827),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        enabled = !isDetecting,
                        onClick = {
                            scope.launch {
                                isDetecting = true
                                quad = engine.detectDocumentQuadForUri(imageUri.toString())
                                isDetecting = false
                            }
                        },
                        modifier = Modifier.weight(1f).testTag("crop_auto_detect_btn")
                    ) {
                        Icon(Icons.Rounded.AutoFixHigh, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (isDetecting) "Detecting…" else "Auto Detect", color = Color.White)
                    }
                    OutlinedButton(
                        onClick = { quad = NormalizedQuad.FULL },
                        modifier = Modifier.weight(1f).testTag("crop_full_frame_btn")
                    ) {
                        Icon(Icons.Rounded.CropFree, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Full Frame", color = Color.White)
                    }
                }
            }
        }
    }
}
