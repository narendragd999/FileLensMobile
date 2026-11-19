package com.filelenspro.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.filelenspro.app.R

@Immutable
data class FileLensColors(
    val bg: Color,
    val surface: Color,
    val card: Color,
    val surface2: Color,
    val border: Color,
    val text: Color,
    val textSecondary: Color,
    val muted: Color,
    val dim: Color,
    val accent: Color,
    val accentSoft: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val highlight: Color,
    val highlightCurrent: Color,
    val isDark: Boolean
)

val AlabasterLightColors = FileLensColors(
    bg = Color(0xFFF4F6F9),
    surface = Color(0xFFFFFFFF),
    card = Color(0xFFFFFFFF),
    surface2 = Color(0xFFE8EEF5),
    border = Color(0xFFE2E8F0),
    text = Color(0xFF0F172A),
    textSecondary = Color(0xFF475569),
    muted = Color(0xFF64748B),
    dim = Color(0xFF94A3B8),
    accent = Color(0xFF2563EB),
    accentSoft = Color(0xFF3B82F6),
    success = Color(0xFF059669),
    warning = Color(0xFFD97706),
    danger = Color(0xFFDC2626),
    highlight = Color(0x88FEF08A),
    highlightCurrent = Color(0xAAFDE047),
    isDark = false
)

val TitaniumDarkColors = FileLensColors(
    bg = Color(0xFF0D0F12),
    surface = Color(0xFF16191E),
    card = Color(0xFF16191E),
    surface2 = Color(0xFF222730),
    border = Color(0xFF2A303C),
    text = Color(0xFFF8FAFC),
    textSecondary = Color(0xFF94A3B8),
    muted = Color(0xFF94A3B8),
    dim = Color(0xFF64748B),
    accent = Color(0xFF2563EB),
    accentSoft = Color(0xFF60A5FA),
    success = Color(0xFF10B981),
    warning = Color(0xFFF59E0B),
    danger = Color(0xFFEF4444),
    highlight = Color(0x55EAB308),
    highlightCurrent = Color(0xAAEAB308),
    isDark = true
)

val LocalFileLensColors = staticCompositionLocalOf { AlabasterLightColors }

val PlusJakartaSansFamily = FontFamily(
    Font(R.font.plus_jakarta_sans, FontWeight.Normal),
    Font(R.font.plus_jakarta_sans, FontWeight.Medium),
    Font(R.font.plus_jakarta_sans, FontWeight.SemiBold),
    Font(R.font.plus_jakarta_sans, FontWeight.Bold)
)

val JetBrainsMonoFamily = FontFamily(
    Font(R.font.jetbrains_mono, FontWeight.Normal),
    Font(R.font.jetbrains_mono, FontWeight.Medium),
    Font(R.font.jetbrains_mono, FontWeight.Bold)
)

val FileLensTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp
    ),
    headlineMedium = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp
    ),
    titleLarge = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        lineHeight = 24.sp
    ),
    titleMedium = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 21.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 19.sp
    ),
    labelLarge = TextStyle(
        fontFamily = PlusJakartaSansFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        lineHeight = 18.sp
    ),
    labelSmall = TextStyle(
        fontFamily = JetBrainsMonoFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp
    )
)

val FileLensShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(24.dp)
)

@Composable
fun FileLensTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val palette = if (darkTheme) TitaniumDarkColors else AlabasterLightColors
    val m3Scheme = if (darkTheme) {
        darkColorScheme(
            primary = palette.accent,
            onPrimary = Color.White,
            secondary = palette.accentSoft,
            background = palette.bg,
            onBackground = palette.text,
            surface = palette.surface,
            onSurface = palette.text,
            surfaceVariant = palette.surface2,
            onSurfaceVariant = palette.textSecondary,
            outline = palette.border,
            error = palette.danger
        )
    } else {
        lightColorScheme(
            primary = palette.accent,
            onPrimary = Color.White,
            secondary = palette.accentSoft,
            background = palette.bg,
            onBackground = palette.text,
            surface = palette.surface,
            onSurface = palette.text,
            surfaceVariant = palette.surface2,
            onSurfaceVariant = palette.textSecondary,
            outline = palette.border,
            error = palette.danger
        )
    }

    CompositionLocalProvider(LocalFileLensColors provides palette) {
        MaterialTheme(
            colorScheme = m3Scheme,
            typography = FileLensTypography,
            shapes = FileLensShapes,
            content = content
        )
    }
}
