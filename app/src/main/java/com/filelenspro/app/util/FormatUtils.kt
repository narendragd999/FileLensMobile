package com.filelenspro.app.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.filelenspro.app.data.db.FileEntity
import java.io.File
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date
import java.util.Locale
import kotlin.math.log10
import kotlin.math.pow

object FormatUtils {

    fun formatSize(bytes: Long): String {
        if (bytes <= 0L) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB", "TB")
        val group = (log10(bytes.toDouble()) / log10(1024.0)).toInt().coerceIn(0, units.lastIndex)
        return String.format(Locale.US, "%.1f %s", bytes / 1024.0.pow(group.toDouble()), units[group])
    }

    fun formatDate(isoOrMillis: String): String {
        if (isoOrMillis.isBlank()) return ""
        return try {
            val instant = Instant.parse(isoOrMillis)
            DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US)
                .withZone(ZoneId.systemDefault())
                .format(instant)
        } catch (_: Exception) {
            isoOrMillis.take(10)
        }
    }

    fun formatDateTime(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            val instant = Instant.parse(iso)
            DateTimeFormatter.ofPattern("dd MMM, hh:mm a", Locale.US)
                .withZone(ZoneId.systemDefault())
                .format(instant)
        } catch (_: Exception) {
            try {
                val odt = java.time.OffsetDateTime.parse(iso)
                DateTimeFormatter.ofPattern("dd MMM, hh:mm a", Locale.US).format(odt)
            } catch (_: Exception) {
                iso.take(16)
            }
        }
    }

    fun formatMillis(ms: Long): String {
        return SimpleDateFormat("dd MMM yyyy", Locale.US).format(Date(ms))
    }

    fun shareFileOrText(context: Context, uriString: String?, fallbackText: String, title: String) {
        try {
            if (!uriString.isNullOrBlank()) {
                val file = resolveLocalFile(uriString)
                if (file != null && file.exists()) {
                    val contentUri = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file
                    )
                    val ext = file.extension.lowercase(Locale.ROOT)
                    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = mime
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        putExtra(Intent.EXTRA_SUBJECT, title)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(intent, "Share $title"))
                    return
                }
            }
            val textIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, title)
                putExtra(Intent.EXTRA_TEXT, fallbackText)
            }
            context.startActivity(Intent.createChooser(textIntent, "Share $title"))
        } catch (_: Exception) {}
    }

    fun openInExternalViewer(context: Context, uriString: String, extension: String) {
        try {
            val file = resolveLocalFile(uriString)
            val targetUri = if (file != null && file.exists()) {
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            } else {
                Uri.parse(uriString)
            }
            val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase(Locale.ROOT)) ?: "*/*"
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(targetUri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "Open with"))
        } catch (_: Exception) {}
    }

    fun exportTextToFileAndShare(context: Context, fileName: String, format: String, content: String, entry: FileEntity? = null) {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val base = fileName.substringBeforeLast('.').replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val ext = format.lowercase(Locale.ROOT)
        val outFile = File(exportDir, "${base}_export.$ext")
        val body = when (ext) {
            "json" -> buildString {
                append("{\n")
                append("  \"name\": \"${fileName.replace("\"", "\\\"")}\",\n")
                append("  \"size\": ${entry?.size ?: 0},\n")
                append("  \"text\": \"${content.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")}\"\n")
                append("}")
            }
            "csv" -> "File,Size,ExtractedText\n\"${fileName.replace("\"", "\"\"")}\",${entry?.size ?: 0},\"${content.replace("\"", "\"\"")}\""
            "md" -> "# $fileName\n\n$content"
            else -> content
        }
        outFile.writeText(body)
        shareFileOrText(context, outFile.toURI().toString(), body, outFile.name)
    }

    fun resolveLocalFile(uriString: String): File? {
        return try {
            when {
                uriString.startsWith("file://") -> {
                    val raw = Uri.parse(uriString).path ?: uriString.removePrefix("file://")
                    File(Uri.decode(raw)).takeIf { it.exists() } ?: File(raw)
                }
                !uriString.startsWith("content://") -> {
                    File(Uri.decode(uriString)).takeIf { it.exists() } ?: File(uriString)
                }
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }
}
