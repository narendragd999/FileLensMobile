package com.filelenspro.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.ui.theme.LocalFileLensColors
import java.util.concurrent.atomic.AtomicLong

enum class SmartToastType {
    SUCCESS,
    INFO,
    WARNING,
    ERROR
}

data class SmartToastEvent(
    val id: Long,
    val message: String,
    val type: SmartToastType,
    val durationMs: Long,
    val actionLabel: String? = null,
    val onAction: (() -> Unit)? = null
)

object SmartToastClassifier {
    private val idCounter = AtomicLong(1L)

    fun create(
        message: String,
        explicitType: SmartToastType? = null,
        actionLabel: String? = null,
        onAction: (() -> Unit)? = null
    ): SmartToastEvent {
        val clean = message.trim()
        val type = explicitType ?: classify(clean)
        val baseDuration = computeDurationMs(clean, type)
        val duration = if (!actionLabel.isNullOrBlank() && onAction != null) {
            baseDuration.coerceAtLeast(4200L)
        } else {
            baseDuration
        }
        return SmartToastEvent(
            id = idCounter.getAndIncrement(),
            message = clean,
            type = type,
            durationMs = duration,
            actionLabel = actionLabel,
            onAction = onAction
        )
    }

    fun classify(message: String): SmartToastType {
        val m = message.lowercase()
        val isError = m.contains("failed") ||
            m.contains("unable") ||
            m.contains("invalid") ||
            m.contains("could not") ||
            m.contains("cannot ") ||
            m.contains("denied") ||
            m.contains("error")
        if (isError) return SmartToastType.ERROR

        val isWarning = m.contains("deleted") ||
            m.contains("removed") ||
            m.contains("cleared") ||
            m.contains("released") ||
            m.contains("select at least") ||
            m.contains("already ") ||
            m.contains("no pending") ||
            m.contains("no readable") ||
            m.contains("not found") ||
            m.contains("unavailable") ||
            m.contains("protected")
        if (isWarning) return SmartToastType.WARNING

        val isSuccess = m.contains("saved") ||
            m.contains("indexed") ||
            m.contains("shrunk") ||
            m.contains("compressed") ||
            m.contains("rotated") ||
            m.contains("cleaned") ||
            m.contains("merged") ||
            m.contains("appended") ||
            m.contains("extracted") ||
            m.contains("copied") ||
            m.contains("renamed") ||
            m.contains("created") ||
            m.contains("activated") ||
            m.contains("granted") ||
            m.contains("updated") ||
            m.contains("captured") ||
            m.contains("smart name") ||
            m.contains("processed") ||
            m.contains("duplicated") ||
            m.contains("added") ||
            m.contains("imported") ||
            m.contains("moved") ||
            m.contains("scheduled") ||
            m.contains("rescheduled") ||
            m.contains("successfully")
        if (isSuccess) return SmartToastType.SUCCESS

        return SmartToastType.INFO
    }

    /**
     * Adaptive display time based on reading length and severity:
     * - Snappy quick confirmations (e.g., "Copied note", "Rotated page 1"): 1.9s
     * - Standard status messages: 2.6s
     * - Longer summaries or warnings: 3.1s
     * - Errors or dense multi-stat summaries: 3.6s
     */
    fun computeDurationMs(message: String, type: SmartToastType): Long {
        val len = message.length
        return when {
            type == SmartToastType.ERROR -> if (len > 55) 3800L else 3200L
            len <= 32 -> 1900L
            len <= 64 -> if (type == SmartToastType.WARNING) 2900L else 2500L
            else -> 3400L
        }
    }
}

/**
 * Floating top-anchored Smart Toast pill:
 * - Never overlaps or hides any bottom buttons, FABs, Save PDF bars, or navigation tabs
 * - Auto-styled with semantic icon, gradient rim, and color accent
 * - Smart adaptive display duration with live shrinking progress bar
 * - Swipe up or tap × to dismiss immediately
 */
@Composable
fun SmartToastHost(
    event: SmartToastEvent?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    applyStatusBarPadding: Boolean = true
) {
    val palette = LocalFileLensColors.current
    // Keep last non-null event briefly so exit animation renders smoothly
    var lastRendered by remember { mutableStateOf<SmartToastEvent?>(null) }
    if (event != null) {
        lastRendered = event
    }

    val progress = remember { Animatable(1f) }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(event?.id) {
        dragOffsetY = 0f
        if (event != null) {
            progress.snapTo(1f)
            progress.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = event.durationMs.toInt(),
                    easing = LinearEasing
                )
            )
            onDismiss()
        }
    }

    val containerMod = if (applyStatusBarPadding) {
        modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(top = 8.dp, start = 14.dp, end = 14.dp)
    } else {
        modifier
            .fillMaxWidth()
            .padding(top = 8.dp, start = 14.dp, end = 14.dp)
    }

    Box(
        modifier = containerMod,
        contentAlignment = Alignment.TopCenter
    ) {
        AnimatedVisibility(
            visible = event != null,
            enter = slideInVertically(
                initialOffsetY = { -it - 48 },
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMediumLow
                )
            ) + fadeIn(tween(180)) + scaleIn(initialScale = 0.92f, animationSpec = tween(180)),
            exit = slideOutVertically(
                targetOffsetY = { -it - 48 },
                animationSpec = tween(200)
            ) + fadeOut(tween(170)) + scaleOut(targetScale = 0.94f, animationSpec = tween(170))
        ) {
            val active = event ?: lastRendered ?: return@AnimatedVisibility
            val accentColor = when (active.type) {
                SmartToastType.SUCCESS -> palette.success
                SmartToastType.ERROR -> palette.danger
                SmartToastType.WARNING -> palette.warning
                SmartToastType.INFO -> palette.accent
            }
            val icon = when (active.type) {
                SmartToastType.SUCCESS -> Icons.Rounded.CheckCircle
                SmartToastType.ERROR -> Icons.Rounded.ErrorOutline
                SmartToastType.WARNING -> Icons.Rounded.WarningAmber
                SmartToastType.INFO -> Icons.Rounded.AutoAwesome
            }
            val surfaceBg = if (palette.isDark) Color(0xF51E293B) else Color(0xF50F172A)

            Surface(
                color = surfaceBg,
                shape = RoundedCornerShape(18.dp),
                shadowElevation = 12.dp,
                modifier = Modifier
                    .widthIn(min = 210.dp, max = 440.dp)
                    .graphicsLayer {
                        translationY = dragOffsetY.coerceAtMost(12f)
                    }
                    .border(
                        width = 1.dp,
                        brush = Brush.horizontalGradient(
                            listOf(
                                accentColor.copy(alpha = 0.65f),
                                accentColor.copy(alpha = 0.25f)
                            )
                        ),
                        shape = RoundedCornerShape(18.dp)
                    )
                    .clip(RoundedCornerShape(18.dp))
                    .pointerInput(active.id) {
                        detectVerticalDragGestures(
                            onDragEnd = {
                                if (dragOffsetY < -28f) {
                                    onDismiss()
                                } else {
                                    dragOffsetY = 0f
                                }
                            },
                            onDragCancel = { dragOffsetY = 0f },
                            onVerticalDrag = { _, dragAmount ->
                                dragOffsetY = (dragOffsetY + dragAmount).coerceIn(-120f, 16f)
                            }
                        )
                    }
                    .testTag("smart_toast_pill")
            ) {
                Column(
                    modifier = Modifier.background(
                        Brush.horizontalGradient(
                            listOf(
                                accentColor.copy(alpha = 0.16f),
                                Color.Transparent
                            )
                        )
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .padding(start = 11.dp, end = 8.dp, top = 10.dp, bottom = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(accentColor.copy(alpha = 0.22f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = icon,
                                contentDescription = active.type.name,
                                tint = accentColor,
                                modifier = Modifier.size(19.dp)
                            )
                        }

                        Text(
                            text = active.message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White,
                            fontWeight = FontWeight.Medium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false)
                        )

                        if (!active.actionLabel.isNullOrBlank() && active.onAction != null) {
                            Surface(
                                color = accentColor.copy(alpha = 0.28f),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .border(1.dp, accentColor.copy(alpha = 0.65f), RoundedCornerShape(10.dp))
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        active.onAction.invoke()
                                        onDismiss()
                                    }
                                    .testTag("smart_toast_action_btn")
                            ) {
                                Text(
                                    text = active.actionLabel,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                )
                            }
                        }

                        Spacer(Modifier.width(2.dp))

                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.10f))
                                .clickable(onClick = onDismiss)
                                .testTag("smart_toast_dismiss_btn"),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Dismiss notification",
                                tint = Color.White.copy(alpha = 0.78f),
                                modifier = Modifier.size(15.dp)
                            )
                        }
                    }

                    // Live countdown bar along bottom edge
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(2.5.dp)
                            .background(Color.White.copy(alpha = 0.08f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progress.value.coerceIn(0f, 1f))
                                .height(2.5.dp)
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(accentColor, accentColor.copy(alpha = 0.55f))
                                    )
                                )
                        )
                    }
                }
            }
        }
    }
}
