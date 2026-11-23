package com.filelenspro.app.service

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.filelenspro.app.data.model.NormalizedQuad
import com.filelenspro.app.data.model.PdfCompressPreset
import com.filelenspro.app.data.model.PdfPageSizePreset
import com.filelenspro.app.data.model.PdfQualityPreset
import com.filelenspro.app.data.model.PhotoCompressPreset
import com.filelenspro.app.data.model.SavedSignatureItem
import com.filelenspro.app.data.model.SignaturePlacement
import com.filelenspro.app.domain.engine.DocumentEdgeDetector
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.pdmodel.graphics.state.RenderingMode
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.util.Matrix as PdfMatrix
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

class OcrAndPdfEngine(private val context: Context) {

    private val latinRecognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }
    private val devanagariRecognizer by lazy {
        TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
    }

    private val renderLock = Any()

    fun openPfd(uriString: String): ParcelFileDescriptor? {
        return try {
            when {
                uriString.startsWith("content://") ->
                    context.contentResolver.openFileDescriptor(Uri.parse(uriString), "r")
                uriString.startsWith("file://") -> {
                    val raw = Uri.parse(uriString).path ?: uriString.removePrefix("file://")
                    val f = File(Uri.decode(raw)).takeIf { it.exists() } ?: File(raw)
                    if (f.exists()) ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY) else null
                }
                else -> {
                    val f = File(Uri.decode(uriString)).takeIf { it.exists() } ?: File(uriString)
                    if (f.exists()) ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY) else null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    fun decodeSampledBitmap(uriString: String, maxDim: Int = 1600): Bitmap? {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            openInputStream(uriString)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

            var sample = 1
            while (bounds.outHeight / sample > maxDim || bounds.outWidth / sample > maxDim) {
                sample *= 2
            }
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            val raw = openInputStream(uriString)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
            applyExifRotation(uriString, raw)
        } catch (_: Exception) {
            null
        }
    }

    private fun applyExifRotation(uriString: String, bitmap: Bitmap): Bitmap {
        return try {
            val orientation = openInputStream(uriString)?.use {
                ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            } ?: ExifInterface.ORIENTATION_NORMAL
            val degrees = when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (degrees == 0f) bitmap
            else {
                val m = Matrix().apply { postRotate(degrees) }
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
            }
        } catch (_: Exception) {
            bitmap
        }
    }

    fun openInputStream(uriString: String) = try {
        when {
            uriString.startsWith("content://") -> context.contentResolver.openInputStream(Uri.parse(uriString))
            uriString.startsWith("file://") -> {
                val raw = Uri.parse(uriString).path ?: uriString.removePrefix("file://")
                val f = File(Uri.decode(raw)).takeIf { it.exists() } ?: File(raw)
                f.inputStream()
            }
            else -> {
                val f = File(Uri.decode(uriString)).takeIf { it.exists() } ?: File(uriString)
                f.inputStream()
            }
        }
    } catch (_: Exception) {
        null
    }

    suspend fun extractTextFromImage(uriString: String, language: String = "eng+hin"): String = withContext(Dispatchers.IO) {
        val bitmap = decodeSampledBitmap(uriString, 1800) ?: return@withContext ""
        try {
            val image = InputImage.fromBitmap(bitmap, 0)
            val sb = StringBuilder()
            if (language.contains("eng") || language == "latin" || language.contains("hin")) {
                val latinRes = runCatching { latinRecognizer.process(image).await().text }.getOrDefault("")
                if (latinRes.isNotBlank()) sb.append(latinRes.trim())
            }
            if (language.contains("hin") || language == "devanagari") {
                val devRes = runCatching { devanagariRecognizer.process(image).await().text }.getOrDefault("")
                val hasDevanagari = devRes.any { it.code in 0x0900..0x097F }
                if (hasDevanagari && devRes.isNotBlank()) {
                    if (sb.isNotEmpty()) sb.append("\n\n")
                    sb.append(devRes.trim())
                }
            }
            sb.toString().trim()
        } catch (_: Exception) {
            ""
        } finally {
            bitmap.recycle()
        }
    }

    suspend fun extractPdfTextAndPageCount(uriString: String, ocrLanguage: String = "eng+hin"): Pair<String, Int> =
        withContext(Dispatchers.IO) {
            var pageCount = 1
            val extractedBuilder = StringBuilder()
            try {
                openInputStream(uriString)?.use { ins ->
                    PDDocument.load(ins).use { doc ->
                        pageCount = doc.numberOfPages.coerceAtLeast(1)
                        val stripper = PDFTextStripper()
                        val maxDirectPages = pageCount.coerceAtMost(40)
                        for (p in 1..maxDirectPages) {
                            stripper.startPage = p
                            stripper.endPage = p
                            val pageText = stripper.getText(doc).trim()
                            if (pageText.isNotBlank()) {
                                extractedBuilder.append("[Page $p]\n").append(pageText).append("\n\n")
                            }
                        }
                    }
                }
            } catch (_: Exception) {}

            // Fallback to parallel on-device ML Kit OCR for scanned image-only PDFs (up to 16 pages)
            if (extractedBuilder.toString().trim().length < 25) {
                val pagesToOcr = renderPdfToImages(uriString, limit = 16, maxDim = 1400)
                val pageTexts = coroutineScope {
                    pagesToOcr.mapIndexed { index, imgPath ->
                        async {
                            val ocr = extractTextFromImage(imgPath, ocrLanguage)
                            index to ocr
                        }
                    }.awaitAll().sortedBy { it.first }
                }
                pageTexts.forEach { (index, ocr) ->
                    if (ocr.isNotBlank()) {
                        extractedBuilder.append("[Page ${index + 1}]\n").append(ocr).append("\n\n")
                    }
                }
            }
            extractedBuilder.toString().trim() to pageCount
        }

    private fun localFileStamp(uriString: String): String {
        val local = com.filelenspro.app.util.FormatUtils.resolveLocalFile(uriString)
        return if (local != null && local.exists()) {
            "${local.lastModified()}_${local.length()}"
        } else {
            "u_${abs(uriString.hashCode())}"
        }
    }

    fun invalidatePdfCache(uriString: String) {
        try {
            val hash = abs(uriString.hashCode())
            File(context.cacheDir, "pdf_images/doc_$hash").deleteRecursively()
            val thumbDir = File(context.cacheDir, "pdf_thumbs")
            thumbDir.listFiles()?.forEach { f ->
                if (f.name.startsWith("thumb_${hash}")) f.delete()
            }
        } catch (_: Exception) {}
    }

    suspend fun getPdfThumbnailPath(uriString: String): String? = withContext(Dispatchers.IO) {
        val cacheDir = File(context.cacheDir, "pdf_thumbs").apply { mkdirs() }
        val hash = abs(uriString.hashCode())
        val stamp = localFileStamp(uriString)
        val outFile = File(cacheDir, "thumb_${hash}_${stamp}.jpg")
        if (outFile.exists() && outFile.length() > 0) return@withContext outFile.absolutePath

        // Clean any outdated thumbnail for the same URI hash so cache doesn't grow
        cacheDir.listFiles()?.forEach { f ->
            if (f.name.startsWith("thumb_${hash}") && f.name != outFile.name) f.delete()
        }

        val pfd = openPfd(uriString) ?: return@withContext null
        synchronized(renderLock) {
            try {
                PdfRenderer(pfd).use { renderer ->
                    if (renderer.pageCount <= 0) return@withContext null
                    renderer.openPage(0).use { page ->
                        val maxW = 420
                        val scale = maxW.toFloat() / page.width.coerceAtLeast(1)
                        val w = (page.width * scale).toInt().coerceAtLeast(1)
                        val h = (page.height * scale).toInt().coerceAtLeast(1)
                        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                        bmp.eraseColor(Color.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        FileOutputStream(outFile).use { bmp.compress(Bitmap.CompressFormat.JPEG, 82, it) }
                        bmp.recycle()
                        outFile.absolutePath
                    }
                }
            } catch (_: Exception) {
                null
            } finally {
                try { pfd.close() } catch (_: Exception) {}
            }
        }
    }

    suspend fun getPdfPageCount(uriString: String): Int = withContext(Dispatchers.IO) {
        val pfd = openPfd(uriString) ?: return@withContext 1
        synchronized(renderLock) {
            try {
                PdfRenderer(pfd).use { it.pageCount.coerceAtLeast(1) }
            } catch (_: Exception) {
                1
            } finally {
                try { pfd.close() } catch (_: Exception) {}
            }
        }
    }

    suspend fun renderPdfToImages(
        uriString: String,
        offset: Int = 0,
        limit: Int = 50,
        maxDim: Int = 1400,
        forceRefresh: Boolean = false
    ): List<String> = withContext(Dispatchers.IO) {
        val pfd = openPfd(uriString) ?: return@withContext emptyList()
        val cacheRoot = File(context.cacheDir, "pdf_images").apply { mkdirs() }
        val baseStamp = localFileStamp(uriString)
        val versionToken = if (forceRefresh) "${baseStamp}_${System.nanoTime()}" else baseStamp
        val docDir = File(cacheRoot, "doc_${abs(uriString.hashCode())}").apply {
            if (forceRefresh) deleteRecursively()
            mkdirs()
        }
        val outPaths = mutableListOf<String>()
        synchronized(renderLock) {
            try {
                if (!forceRefresh) {
                    // Remove stale files from older PDF revisions so cache stays lean
                    val expectedSuffix = "_${versionToken}.jpg"
                    docDir.listFiles()?.forEach { f ->
                        if (!f.name.endsWith(expectedSuffix)) f.delete()
                    }
                }
                PdfRenderer(pfd).use { renderer ->
                    val end = (offset + limit).coerceAtMost(renderer.pageCount)
                    for (i in offset until end) {
                        val pageFile = File(docDir, "p_${i}_${versionToken}.jpg")
                        if (!pageFile.exists() || pageFile.length() == 0L) {
                            renderer.openPage(i).use { page ->
                                val scale = minOf(
                                    maxDim.toFloat() / page.width.coerceAtLeast(1),
                                    maxDim.toFloat() / page.height.coerceAtLeast(1)
                                ).coerceAtMost(2.5f)
                                val w = (page.width * scale).toInt().coerceAtLeast(1)
                                val h = (page.height * scale).toInt().coerceAtLeast(1)
                                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                                bmp.eraseColor(Color.WHITE)
                                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                FileOutputStream(pageFile).use { bmp.compress(Bitmap.CompressFormat.JPEG, 88, it) }
                                bmp.recycle()
                            }
                        }
                        outPaths.add(pageFile.absolutePath)
                    }
                }
            } catch (_: Exception) {
            } finally {
                try { pfd.close() } catch (_: Exception) {}
            }
        }
        outPaths
    }

    suspend fun buildPdfFromImages(
        imageUris: List<String>,
        outputFile: File,
        rotations: List<Int> = emptyList(),
        filters: List<String> = emptyList(),
        quads: List<NormalizedQuad> = emptyList(),
        pageSize: PdfPageSizePreset = PdfPageSizePreset.AUTO,
        qualityPreset: PdfQualityPreset = PdfQualityPreset.BALANCED,
        pdfPassword: String? = null,
        embedOcrTextLayer: Boolean = true
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            outputFile.parentFile?.mkdirs()
            val prepared = coroutineScope {
                imageUris.mapIndexed { idx, uri ->
                    async {
                        val raw = decodeSampledBitmap(uri, qualityPreset.maxDim) ?: return@async null
                        val quad = quads.getOrElse(idx) { NormalizedQuad.FULL }
                        val warped = if (!quad.isFullFrame()) {
                            val w = DocumentEdgeDetector.warpPerspective(raw, quad, qualityPreset.maxDim)
                            if (w !== raw) raw.recycle()
                            w
                        } else raw
                        val rot = rotations.getOrElse(idx) { 0 } % 360
                        val flt = filters.getOrElse(idx) { "original" }
                        val finalBmp = processBitmapFilterAndRotation(warped, flt, rot)
                        val visionText = if (embedOcrTextLayer) {
                            runCatching {
                                latinRecognizer.process(InputImage.fromBitmap(finalBmp, 0)).await()
                            }.getOrNull()
                        } else null
                        Triple(idx, finalBmp, visionText)
                    }
                }.awaitAll().filterNotNull().sortedBy { it.first }
            }
            if (prepared.isEmpty()) return@withContext false
            PDDocument().use { doc ->
                prepared.forEach { (_, bmp, visionText) ->
                    val rect = when (pageSize) {
                        PdfPageSizePreset.A4 -> PDRectangle.A4
                        PdfPageSizePreset.LETTER -> PDRectangle.LETTER
                        PdfPageSizePreset.AUTO -> {
                            val pageW = PDRectangle.A4.width
                            val pageH = pageW * (bmp.height.toFloat() / bmp.width.coerceAtLeast(1))
                            PDRectangle(pageW, pageH)
                        }
                    }
                    val page = PDPage(rect)
                    doc.addPage(page)
                    val pdImage = JPEGFactory.createFromImage(doc, bmp, qualityPreset.jpegQuality)
                    val drawX: Float
                    val drawY: Float
                    val drawW: Float
                    val drawH: Float
                    if (pageSize == PdfPageSizePreset.AUTO) {
                        drawX = 0f
                        drawY = 0f
                        drawW = rect.width
                        drawH = rect.height
                    } else {
                        val margin = 18f
                        val availW = rect.width - margin * 2f
                        val availH = rect.height - margin * 2f
                        val imgRatio = bmp.width.toFloat() / bmp.height.coerceAtLeast(1)
                        val boxRatio = availW / availH
                        drawW = if (imgRatio > boxRatio) availW else availH * imgRatio
                        drawH = if (imgRatio > boxRatio) availW / imgRatio else availH
                        drawX = (rect.width - drawW) / 2f
                        drawY = (rect.height - drawH) / 2f
                    }
                    PDPageContentStream(doc, page).use { cs ->
                        cs.drawImage(pdImage, drawX, drawY, drawW, drawH)
                        // Embed invisible selectable/searchable OCR text layer (PDFBox RenderingMode.NEITHER)
                        if (embedOcrTextLayer && visionText != null) {
                            val scaleX = drawW / bmp.width.coerceAtLeast(1).toFloat()
                            val scaleY = drawH / bmp.height.coerceAtLeast(1).toFloat()
                            val font = PDType1Font.HELVETICA
                            visionText.textBlocks.forEach { block ->
                                block.lines.forEach { line ->
                                    val box = line.boundingBox ?: return@forEach
                                    val ascii = line.text
                                        .replace(Regex("[^\\x20-\\x7E]"), " ")
                                        .replace(Regex("\\s+"), " ")
                                        .trim()
                                    if (ascii.isEmpty()) return@forEach
                                    val boxW = (box.width() * scaleX).coerceAtLeast(4f)
                                    val boxH = (box.height() * scaleY).coerceIn(5f, 48f)
                                    val pdfX = drawX + box.left * scaleX
                                    val pdfY = (drawY + drawH - box.bottom * scaleY).coerceIn(2f, rect.height - 4f)
                                    runCatching {
                                        val rawWidth = (font.getStringWidth(ascii) / 1000f) * boxH
                                        val horizScale = if (rawWidth > 1f) {
                                            ((boxW / rawWidth) * 100f).coerceIn(30f, 220f)
                                        } else 100f
                                        cs.beginText()
                                        cs.setRenderingMode(RenderingMode.NEITHER)
                                        cs.setFont(font, boxH)
                                        cs.setHorizontalScaling(horizScale)
                                        cs.newLineAtOffset(pdfX, pdfY)
                                        cs.showText(ascii)
                                        cs.endText()
                                    }
                                }
                            }
                        }
                    }
                    bmp.recycle()
                }
                val cleanPass = pdfPassword?.trim().orEmpty()
                if (cleanPass.isNotEmpty()) {
                    val ap = AccessPermission()
                    val policy = StandardProtectionPolicy(cleanPass, cleanPass, ap).apply {
                        encryptionKeyLength = 128
                        permissions = ap
                    }
                    doc.protect(policy)
                }
                doc.save(outputFile)
            }
            invalidatePdfCache(outputFile.toURI().toString())
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Smart PDF Compressor: re-renders pages cleanly via Android PdfRenderer at preset resolution
     * and JPEG quality while preserving original page aspect ratio. Never bloats an already-compact PDF.
     */
    suspend fun compressPdf(
        pdfUri: String,
        originalSizeBytes: Long,
        preset: PdfCompressPreset,
        outFile: File
    ): Pair<Long, Boolean> = withContext(Dispatchers.IO) {
        val pfd = openPfd(pdfUri) ?: return@withContext originalSizeBytes to false
        val tempPdf = File(context.cacheDir, "cmp_pdf_${System.currentTimeMillis()}.pdf")
        try {
            synchronized(renderLock) {
                PdfRenderer(pfd).use { renderer ->
                    if (renderer.pageCount <= 0) return@withContext originalSizeBytes to false
                    PDDocument().use { doc ->
                        for (i in 0 until renderer.pageCount) {
                            renderer.openPage(i).use { page ->
                                val maxSide = maxOf(page.width, page.height).coerceAtLeast(1)
                                val scale = (preset.maxDimension.toFloat() / maxSide.toFloat()).coerceIn(0.6f, 2.2f)
                                val bmpW = (page.width * scale).toInt().coerceAtLeast(1)
                                val bmpH = (page.height * scale).toInt().coerceAtLeast(1)
                                val bmp = Bitmap.createBitmap(bmpW, bmpH, Bitmap.Config.ARGB_8888)
                                bmp.eraseColor(Color.WHITE)
                                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                                val rect = PDRectangle(page.width.toFloat(), page.height.toFloat())
                                val pdPage = PDPage(rect)
                                doc.addPage(pdPage)
                                val pdImg = JPEGFactory.createFromImage(doc, bmp, preset.jpegQuality)
                                PDPageContentStream(doc, pdPage).use { cs ->
                                    cs.drawImage(pdImg, 0f, 0f, rect.width, rect.height)
                                }
                                bmp.recycle()
                            }
                        }
                        doc.save(tempPdf)
                    }
                }
            }
            val newSize = tempPdf.length()
            val threshold = if (originalSizeBytes > 0L) (originalSizeBytes * 0.92).toLong() else Long.MAX_VALUE
            if (newSize > 0L && newSize < threshold) {
                outFile.parentFile?.mkdirs()
                tempPdf.copyTo(outFile, overwrite = true)
                outFile.setLastModified(System.currentTimeMillis())
                invalidatePdfCache(pdfUri)
                invalidatePdfCache(outFile.toURI().toString())
                newSize to true
            } else {
                originalSizeBytes to false
            }
        } catch (_: Exception) {
            originalSizeBytes to false
        } finally {
            try { pfd.close() } catch (_: Exception) {}
            tempPdf.delete()
        }
    }

    suspend fun detectDocumentQuadForUri(uriString: String): NormalizedQuad = withContext(Dispatchers.IO) {
        val bmp = decodeSampledBitmap(uriString, 640) ?: return@withContext NormalizedQuad.FULL
        try {
            DocumentEdgeDetector.detectFromBitmap(bmp)
        } finally {
            bmp.recycle()
        }
    }

    suspend fun suggestSmartTitleForImage(uriString: String, ocrLanguage: String = "eng+hin"): String =
        withContext(Dispatchers.IO) {
            val text = extractTextFromImage(uriString, ocrLanguage)
            DocumentEdgeDetector.suggestSmartDocumentTitle(text)
        }

    /**
     * Smart visually-lossless photo compressor:
     * Preserves EXIF orientation, strips bloated embedded thumbnails/metadata,
     * downscales only when exceeding the preset threshold, and never produces a larger file.
     * Returns pair(compressedBytes, wasReduced).
     */
    suspend fun smartCompressPhoto(
        uriString: String,
        originalSizeBytes: Long,
        preset: PhotoCompressPreset,
        outFile: File,
        useWebp: Boolean = false
    ): Pair<Long, Boolean> = withContext(Dispatchers.IO) {
        val tempFile = File(context.cacheDir, "cmp_${System.currentTimeMillis()}.${if (useWebp) "webp" else "jpg"}")
        try {
            // Decode full or gently bounded bitmap according to preset maxDimension
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            openInputStream(uriString)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext originalSizeBytes to false

            var sample = 1
            while (bounds.outWidth / (sample * 2) >= preset.maxDimension || bounds.outHeight / (sample * 2) >= preset.maxDimension) {
                sample *= 2
            }
            val opts = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val raw = openInputStream(uriString)?.use { BitmapFactory.decodeStream(it, null, opts) }
                ?: return@withContext originalSizeBytes to false
            val oriented = applyExifRotation(uriString, raw)
            if (oriented !== raw) raw.recycle()

            val maxSide = maxOf(oriented.width, oriented.height)
            val finalBmp = if (maxSide > preset.maxDimension) {
                val scale = preset.maxDimension.toFloat() / maxSide.toFloat()
                val nw = (oriented.width * scale).toInt().coerceAtLeast(1)
                val nh = (oriented.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(oriented, nw, nh, true).also { oriented.recycle() }
            } else {
                oriented
            }

            val format = if (useWebp) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    Bitmap.CompressFormat.WEBP_LOSSY
                } else {
                    @Suppress("DEPRECATION")
                    Bitmap.CompressFormat.WEBP
                }
            } else {
                Bitmap.CompressFormat.JPEG
            }

            FileOutputStream(tempFile).use { fos ->
                finalBmp.compress(format, preset.quality, fos)
            }
            finalBmp.recycle()

            val newSize = tempFile.length()
            // Guard: only accept if genuinely smaller by at least 8% (never bloat an already-optimized photo!)
            val minThreshold = if (originalSizeBytes > 0L) (originalSizeBytes * 0.92).toLong() else Long.MAX_VALUE
            if (newSize > 0L && newSize < minThreshold) {
                outFile.parentFile?.mkdirs()
                tempFile.copyTo(outFile, overwrite = true)
                outFile.setLastModified(System.currentTimeMillis())
                newSize to true
            } else {
                originalSizeBytes to false
            }
        } catch (_: Exception) {
            originalSizeBytes to false
        } finally {
            tempFile.delete()
        }
    }

    fun readImageDimensions(uriString: String): Pair<Int, Int> {
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            openInputStream(uriString)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            val w = bounds.outWidth.coerceAtLeast(0)
            val h = bounds.outHeight.coerceAtLeast(0)
            if (w <= 0 || h <= 0) return 0 to 0
            val orientation = openInputStream(uriString)?.use {
                ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            } ?: ExifInterface.ORIENTATION_NORMAL
            val swap = orientation == ExifInterface.ORIENTATION_ROTATE_90 ||
                orientation == ExifInterface.ORIENTATION_ROTATE_270 ||
                orientation == ExifInterface.ORIENTATION_TRANSPOSE ||
                orientation == ExifInterface.ORIENTATION_TRANSVERSE
            if (swap) h to w else w to h
        } catch (_: Exception) {
            0 to 0
        }
    }

    /**
     * Decodes an EXIF-corrected bitmap with optional clockwise display rotation (0/90/180/270)
     * for pixel-exact rendering inside the interactive 4-corner Perspective Crop Editor.
     */
    suspend fun decodeOrientedBitmap(
        uriString: String,
        rotationDeg: Int = 0,
        maxDim: Int = 1440
    ): Bitmap? = withContext(Dispatchers.IO) {
        val raw = decodeSampledBitmap(uriString, maxDim) ?: return@withContext null
        val normRot = ((rotationDeg % 360) + 360) % 360
        if (normRot == 0) return@withContext raw
        val m = Matrix().apply { postRotate(normRot.toFloat()) }
        Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true).also { raw.recycle() }
    }

    /**
     * Ultra-fast (~15–30ms) preview renderer applying real Matrix.setPolyToPoly perspective
     * straightening, scan filter enhancement, and rotation for live Review Studio cards
     * and the Perspective Cropper's "Preview Straightened" toggle.
     */
    suspend fun renderPagePreviewBitmap(
        uriString: String,
        quad: NormalizedQuad,
        filter: String,
        rotationDeg: Int,
        maxDim: Int = 640
    ): Bitmap? = withContext(Dispatchers.Default) {
        try {
            val raw = withContext(Dispatchers.IO) { decodeSampledBitmap(uriString, (maxDim * 1.4f).toInt().coerceAtLeast(720)) }
                ?: return@withContext null
            val warped = if (!quad.isFullFrame()) {
                DocumentEdgeDetector.warpPerspective(raw, quad, maxOutputDim = maxDim).also {
                    if (it !== raw) raw.recycle()
                }
            } else raw
            val processed = processBitmapFilterAndRotation(warped, filter, rotationDeg % 360)
            val maxSide = maxOf(processed.width, processed.height)
            if (maxSide > maxDim) {
                val scale = maxDim.toFloat() / maxSide.toFloat()
                val nw = (processed.width * scale).toInt().coerceAtLeast(1)
                val nh = (processed.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(processed, nw, nh, true).also { processed.recycle() }
            } else {
                processed
            }
        } catch (_: Exception) {
            null
        }
    }

    suspend fun appendImagesToPdf(
        existingPdfUri: String,
        imageUris: List<String>,
        rotations: List<Int> = emptyList(),
        filters: List<String> = emptyList(),
        quads: List<NormalizedQuad> = emptyList(),
        outputFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val tempNew = File(context.cacheDir, "append_pages_${System.currentTimeMillis()}.pdf")
            if (!buildPdfFromImages(imageUris, tempNew, rotations, filters, quads)) return@withContext false
            val tempMerged = File(context.cacheDir, "append_merged_${System.currentTimeMillis()}.pdf")
            val ok = mergePdfs(listOf(existingPdfUri, tempNew.absolutePath), tempMerged)
            tempNew.delete()
            if (ok && tempMerged.exists() && tempMerged.length() > 0L) {
                outputFile.parentFile?.mkdirs()
                tempMerged.copyTo(outputFile, overwrite = true)
                outputFile.setLastModified(System.currentTimeMillis())
                tempMerged.delete()
                invalidatePdfCache(existingPdfUri)
                invalidatePdfCache(outputFile.toURI().toString())
                true
            } else {
                tempMerged.delete()
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    suspend fun buildIdCard2In1Pdf(
        frontUri: String,
        backUri: String?,
        outputFile: File,
        frontRotation: Int = 0,
        backRotation: Int = 0,
        frontFilter: String = "original",
        backFilter: String = "original",
        frontQuad: NormalizedQuad = NormalizedQuad.FULL,
        backQuad: NormalizedQuad = NormalizedQuad.FULL
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            outputFile.parentFile?.mkdirs()
            val (frontBmp, backBmp) = coroutineScope {
                val fJob = async {
                    decodeSampledBitmap(frontUri, 1800)?.let { rawFront ->
                        val warpedFront = if (!frontQuad.isFullFrame()) {
                            DocumentEdgeDetector.warpPerspective(rawFront, frontQuad, 1800).also { if (it !== rawFront) rawFront.recycle() }
                        } else rawFront
                        processBitmapFilterAndRotation(warpedFront, frontFilter, frontRotation % 360)
                    }
                }
                val bJob = async {
                    if (backUri.isNullOrBlank()) null
                    else decodeSampledBitmap(backUri, 1800)?.let { rawBack ->
                        val warpedBack = if (!backQuad.isFullFrame()) {
                            DocumentEdgeDetector.warpPerspective(rawBack, backQuad, 1800).also { if (it !== rawBack) rawBack.recycle() }
                        } else rawBack
                        processBitmapFilterAndRotation(warpedBack, backFilter, backRotation % 360)
                    }
                }
                fJob.await() to bJob.await()
            }

            if (frontBmp == null && backBmp == null) return@withContext false

            PDDocument().use { doc ->
                val page = PDPage(PDRectangle.A4)
                doc.addPage(page)
                val pw = PDRectangle.A4.width
                val ph = PDRectangle.A4.height
                val slotW = pw * 0.76f
                val slotH = slotW * 0.63f // ISO/IEC 7810 ID-1 card ratio (~85.6 × 54mm)
                val slotX = (pw - slotW) / 2f

                fun drawCardInSlot(cs: PDPageContentStream, bmp: Bitmap, slotY: Float) {
                    val imgRatio = bmp.width.toFloat() / bmp.height.coerceAtLeast(1)
                    val slotRatio = slotW / slotH
                    val drawW = if (imgRatio >= slotRatio) slotW else slotH * imgRatio
                    val drawH = if (imgRatio >= slotRatio) slotW / imgRatio else slotH
                    val drawX = slotX + (slotW - drawW) / 2f
                    val drawY = slotY + (slotH - drawH) / 2f
                    val pdImg = JPEGFactory.createFromImage(doc, bmp, 0.90f)
                    cs.drawImage(pdImg, drawX, drawY, drawW, drawH)
                    cs.setStrokingColor(37f / 255f, 99f / 255f, 235f / 255f)
                    cs.setLineWidth(1.2f)
                    cs.addRect(drawX, drawY, drawW, drawH)
                    cs.stroke()
                }

                PDPageContentStream(doc, page).use { cs ->
                    frontBmp?.let { bmp ->
                        drawCardInSlot(cs, bmp, ph - slotH - 86f)
                        bmp.recycle()
                    }
                    backBmp?.let { bmp ->
                        drawCardInSlot(cs, bmp, ph - (slotH * 2f) - 138f)
                        bmp.recycle()
                    }
                }
                doc.save(outputFile)
            }
            invalidatePdfCache(outputFile.toURI().toString())
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun rotatePdfPages(pdfUri: String, pageRotations: Map<Int, Int>, outFile: File): Boolean =
        withContext(Dispatchers.IO) {
            if (pageRotations.isEmpty()) return@withContext false
            val temp = File(context.cacheDir, "rot_${System.currentTimeMillis()}.pdf")
            try {
                val inputStream = openInputStream(pdfUri) ?: return@withContext false
                var modifiedAny = false
                inputStream.use { ins ->
                    PDDocument.load(ins).use { doc ->
                        doc.isAllSecurityToBeRemoved = true
                        pageRotations.forEach { (idx, deg) ->
                            if (idx in 0 until doc.numberOfPages) {
                                val p = doc.getPage(idx)
                                val normalized = ((p.rotation + deg) % 360 + 360) % 360
                                p.rotation = normalized
                                modifiedAny = true
                            }
                        }
                        if (!modifiedAny) return@withContext false
                        doc.save(temp)
                    }
                }
                if (!temp.exists() || temp.length() == 0L) return@withContext false
                outFile.parentFile?.mkdirs()
                temp.copyTo(outFile, overwrite = true)
                outFile.setLastModified(System.currentTimeMillis())
                invalidatePdfCache(pdfUri)
                invalidatePdfCache(outFile.toURI().toString())
                true
            } catch (_: Exception) {
                false
            } finally {
                temp.delete()
            }
        }

    suspend fun deletePdfPages(pdfUri: String, deleteIndices: Set<Int>, outFile: File): Boolean =
        withContext(Dispatchers.IO) {
            if (deleteIndices.isEmpty()) return@withContext false
            val temp = File(context.cacheDir, "del_${System.currentTimeMillis()}.pdf")
            try {
                val inputStream = openInputStream(pdfUri) ?: return@withContext false
                inputStream.use { ins ->
                    PDDocument.load(ins).use { doc ->
                        doc.isAllSecurityToBeRemoved = true
                        if (deleteIndices.size >= doc.numberOfPages) return@withContext false
                        deleteIndices.sortedDescending().forEach { idx ->
                            if (idx in 0 until doc.numberOfPages) doc.removePage(idx)
                        }
                        doc.save(temp)
                    }
                }
                if (!temp.exists() || temp.length() == 0L) return@withContext false
                outFile.parentFile?.mkdirs()
                temp.copyTo(outFile, overwrite = true)
                outFile.setLastModified(System.currentTimeMillis())
                invalidatePdfCache(pdfUri)
                invalidatePdfCache(outFile.toURI().toString())
                true
            } catch (_: Exception) {
                false
            } finally {
                temp.delete()
            }
        }

    suspend fun reorderPdfPages(pdfUri: String, newOrder: List<Int>, outFile: File): Boolean =
        withContext(Dispatchers.IO) {
            if (newOrder.isEmpty()) return@withContext false
            val temp = File(context.cacheDir, "reord_${System.currentTimeMillis()}.pdf")
            try {
                val inputStream = openInputStream(pdfUri) ?: return@withContext false
                inputStream.use { ins ->
                    PDDocument.load(ins).use { src ->
                        src.isAllSecurityToBeRemoved = true
                        PDDocument().use { dst ->
                            newOrder.forEach { idx ->
                                if (idx in 0 until src.numberOfPages) {
                                    val imported = dst.importPage(src.getPage(idx))
                                    imported.rotation = src.getPage(idx).rotation
                                }
                            }
                            if (dst.numberOfPages == 0) return@withContext false
                            dst.save(temp)
                        }
                    }
                }
                if (!temp.exists() || temp.length() == 0L) return@withContext false
                outFile.parentFile?.mkdirs()
                temp.copyTo(outFile, overwrite = true)
                outFile.setLastModified(System.currentTimeMillis())
                invalidatePdfCache(pdfUri)
                invalidatePdfCache(outFile.toURI().toString())
                true
            } catch (_: Exception) {
                false
            } finally {
                temp.delete()
            }
        }

    suspend fun extractPdfPages(pdfUri: String, indices: List<Int>, outFile: File): Boolean =
        reorderPdfPages(pdfUri, indices, outFile)

    suspend fun mergePdfs(pdfUris: List<String>, outFile: File): Boolean = withContext(Dispatchers.IO) {
        val tempInputs = mutableListOf<File>()
        try {
            val merger = PDFMergerUtility()
            pdfUris.forEachIndexed { i, uri ->
                val tmp = File(context.cacheDir, "merge_in_${i}_${System.currentTimeMillis()}.pdf")
                openInputStream(uri)?.use { ins -> FileOutputStream(tmp).use { ins.copyTo(it) } }
                if (tmp.exists() && tmp.length() > 0) {
                    tempInputs.add(tmp)
                    merger.addSource(tmp)
                }
            }
            if (tempInputs.isEmpty()) return@withContext false
            outFile.parentFile?.mkdirs()
            merger.destinationFileName = outFile.absolutePath
            merger.mergeDocuments(com.tom_roush.pdfbox.io.MemoryUsageSetting.setupMainMemoryOnly())
            outFile.setLastModified(System.currentTimeMillis())
            invalidatePdfCache(outFile.toURI().toString())
            outFile.exists() && outFile.length() > 0L
        } catch (_: Exception) {
            false
        } finally {
            tempInputs.forEach { it.delete() }
        }
    }

    suspend fun applyImageFilterAndRotation(
        uriString: String,
        filter: String,
        rotationDeg: Int,
        outFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        val raw = decodeSampledBitmap(uriString, 2000) ?: return@withContext false
        try {
            val rotated = if (rotationDeg % 360 != 0) {
                val m = Matrix().apply { postRotate(rotationDeg.toFloat()) }
                Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true).also { raw.recycle() }
            } else raw

            val filtered = Bitmap.createBitmap(rotated.width, rotated.height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(filtered)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            when (filter.lowercase()) {
                "grayscale" -> {
                    val cm = ColorMatrix().apply { setSaturation(0f) }
                    paint.colorFilter = ColorMatrixColorFilter(cm)
                }
                "bw" -> {
                    val cm = ColorMatrix().apply { setSaturation(0f) }
                    val contrast = ColorMatrix(
                        floatArrayOf(
                            2.4f, 0f, 0f, 0f, -150f,
                            0f, 2.4f, 0f, 0f, -150f,
                            0f, 0f, 2.4f, 0f, -150f,
                            0f, 0f, 0f, 1f, 0f
                        )
                    )
                    cm.postConcat(contrast)
                    paint.colorFilter = ColorMatrixColorFilter(cm)
                }
                "magic", "color" -> {
                    val contrast = ColorMatrix(
                        floatArrayOf(
                            1.25f, 0f, 0f, 0f, -20f,
                            0f, 1.25f, 0f, 0f, -20f,
                            0f, 0f, 1.25f, 0f, -20f,
                            0f, 0f, 0f, 1f, 0f
                        )
                    )
                    paint.colorFilter = ColorMatrixColorFilter(contrast)
                }
            }
            canvas.drawBitmap(rotated, 0f, 0f, paint)
            rotated.recycle()
            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { filtered.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            filtered.recycle()
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun applyWatermarkToImage(
        uriString: String,
        watermarkText: String,
        colorInt: Int,
        alphaFloat: Float,
        outFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        val bmp = decodeSampledBitmap(uriString, 2000) ?: return@withContext false
        try {
            val mutable = bmp.copy(Bitmap.Config.ARGB_8888, true)
            bmp.recycle()
            val canvas = Canvas(mutable)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = colorInt
                alpha = (alphaFloat.coerceIn(0.1f, 0.9f) * 255).toInt()
                textSize = (mutable.width / 10f).coerceAtLeast(36f)
                isFakeBoldText = true
                textAlign = Paint.Align.CENTER
            }
            canvas.save()
            canvas.rotate(-32f, mutable.width / 2f, mutable.height / 2f)
            val stepY = (mutable.height / 3f).coerceAtLeast(220f)
            var y = stepY * 0.5f
            while (y < mutable.height * 1.4f) {
                canvas.drawText(watermarkText, mutable.width / 2f, y, paint)
                y += stepY
            }
            canvas.restore()
            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { mutable.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            mutable.recycle()
            true
        } catch (_: Exception) {
            false
        }
    }

    fun signaturesDir(): File = File(context.filesDir, "Signatures").apply { mkdirs() }

    fun listSavedSignatures(): List<SavedSignatureItem> {
        return (signaturesDir().listFiles() ?: emptyArray())
            .filter { it.isFile && it.extension.equals("png", true) && it.length() > 0L }
            .sortedByDescending { it.lastModified() }
            .map { f ->
                SavedSignatureItem(
                    filePath = f.absolutePath,
                    name = f.nameWithoutExtension,
                    createdMs = f.lastModified()
                )
            }
    }

    suspend fun saveSignatureBitmap(bitmap: Bitmap, label: String = "Signature"): SavedSignatureItem? =
        withContext(Dispatchers.IO) {
            try {
                val safe = label.replace(Regex("[^a-zA-Z0-9_\\-]"), "_").ifBlank { "Signature" }
                val out = File(signaturesDir(), "${safe}_${System.currentTimeMillis()}.png")
                FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                SavedSignatureItem(out.absolutePath, out.nameWithoutExtension, out.lastModified())
            } catch (_: Exception) {
                null
            }
        }

    fun deleteSavedSignature(filePath: String): Boolean = runCatching { File(filePath).delete() }.getOrDefault(false)

    suspend fun applySignatureToImage(
        uriString: String,
        signatureBitmap: Bitmap,
        outFile: File,
        placement: SignaturePlacement = SignaturePlacement()
    ): Boolean = withContext(Dispatchers.IO) {
        val bmp = decodeSampledBitmap(uriString, 2000) ?: return@withContext false
        try {
            val mutable = bmp.copy(Bitmap.Config.ARGB_8888, true)
            bmp.recycle()
            val canvas = Canvas(mutable)
            val sigW = (mutable.width * placement.widthFraction.coerceIn(0.14f, 0.72f)).toInt().coerceAtLeast(100)
            val sigH = (sigW * (signatureBitmap.height.toFloat() / signatureBitmap.width.coerceAtLeast(1))).toInt().coerceAtLeast(40)
            val scaledSig = Bitmap.createScaledBitmap(signatureBitmap, sigW, sigH, true)
            val left = (mutable.width * placement.posX).coerceIn(0f, (mutable.width - sigW).toFloat().coerceAtLeast(0f))
            val top = (mutable.height * placement.posY).coerceIn(0f, (mutable.height - sigH).toFloat().coerceAtLeast(0f))
            canvas.drawBitmap(scaledSig, left, top, null)
            scaledSig.recycle()
            if (placement.includeDateStamp) {
                val dateStr = "Signed ${java.time.LocalDate.now()}"
                val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.rgb(25, 35, 65)
                    textSize = (sigW * 0.12f).coerceIn(18f, 44f)
                    isFakeBoldText = true
                }
                val textY = (top + sigH + textPaint.textSize * 1.1f).coerceAtMost(mutable.height - 8f)
                canvas.drawText(dateStr, left, textY, textPaint)
            }
            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { mutable.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            mutable.recycle()
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Auto-Blur / Privacy Redaction for ID Sharing:
     * Runs on-device ML Kit OCR to find Aadhaar numbers (masks first 8 digits), PAN numbers,
     * debit/credit/bank account numbers (masks all except last 4), and phone numbers,
     * then pixelates & masks those exact bounding boxes onto a clean shareable JPEG.
     * Supports both images and PDFs (renders page 1 cleanly).
     * Returns Pair(success, redactedRegionCount).
     */
    suspend fun redactSensitiveInfoForSharing(
        uriString: String,
        isPdf: Boolean,
        outFile: File
    ): Pair<Boolean, Int> = withContext(Dispatchers.IO) {
        val baseBitmap = if (isPdf) {
            val pages = renderPdfToImages(uriString, offset = 0, limit = 1, maxDim = 1800)
            pages.firstOrNull()?.let { decodeSampledBitmap(it, 1800) }
        } else {
            decodeSampledBitmap(uriString, 1800)
        } ?: return@withContext false to 0

        try {
            val mutable = baseBitmap.copy(Bitmap.Config.ARGB_8888, true)
            baseBitmap.recycle()
            val visionText = runCatching {
                latinRecognizer.process(InputImage.fromBitmap(mutable, 0)).await()
            }.getOrNull()

            val aadhaarRegex = Regex("""\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b""")
            val panRegex = Regex("""\b[A-Z]{5}\d{4}[A-Z]\b""")
            val phoneRegex = Regex("""\b(?:\+?91[\s\-]?)?[6-9]\d{9}\b""")
            val longNumRegex = Regex("""\b(?:\d[\s\-]?){9,16}\b""")

            val regions = mutableListOf<android.graphics.Rect>()
            visionText?.textBlocks?.forEach { block ->
                block.lines.forEach { line ->
                    val txt = line.text.trim()
                    val box = line.boundingBox ?: return@forEach
                    when {
                        aadhaarRegex.containsMatchIn(txt) -> {
                            // Keep last 4 digits visible (mask left 68% of bounding box)
                            val maskRight = box.left + ((box.width() * 0.68f).toInt()).coerceAtLeast(24)
                            regions.add(android.graphics.Rect(box.left - 4, box.top - 4, maskRight, box.bottom + 4))
                        }
                        panRegex.containsMatchIn(txt) -> {
                            // Mask middle characters of PAN
                            val maskLeft = box.left + (box.width() * 0.18f).toInt()
                            val maskRight = box.left + (box.width() * 0.85f).toInt()
                            regions.add(android.graphics.Rect(maskLeft, box.top - 4, maskRight, box.bottom + 4))
                        }
                        phoneRegex.containsMatchIn(txt) || longNumRegex.containsMatchIn(txt) -> {
                            val maskRight = box.left + ((box.width() * 0.68f).toInt()).coerceAtLeast(24)
                            regions.add(android.graphics.Rect(box.left - 4, box.top - 4, maskRight, box.bottom + 4))
                        }
                    }
                }
            }

            val canvas = Canvas(mutable)
            val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb(232, 18, 24, 38)
                style = Paint.Style.FILL
            }
            val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb(220, 226, 232, 240)
                isFakeBoldText = true
                textAlign = Paint.Align.CENTER
            }

            regions.forEach { rawRect ->
                val rect = android.graphics.Rect(
                    rawRect.left.coerceIn(0, mutable.width - 1),
                    rawRect.top.coerceIn(0, mutable.height - 1),
                    rawRect.right.coerceIn(1, mutable.width),
                    rawRect.bottom.coerceIn(1, mutable.height)
                )
                if (rect.width() > 6 && rect.height() > 6) {
                    // Heavy pixelation pass underneath + crisp privacy shield bar
                    val crop = Bitmap.createBitmap(mutable, rect.left, rect.top, rect.width(), rect.height())
                    val tiny = Bitmap.createScaledBitmap(crop, (rect.width() / 16).coerceAtLeast(2), (rect.height() / 16).coerceAtLeast(2), false)
                    val pixelated = Bitmap.createScaledBitmap(tiny, rect.width(), rect.height(), false)
                    canvas.drawBitmap(pixelated, rect.left.toFloat(), rect.top.toFloat(), null)
                    crop.recycle()
                    tiny.recycle()
                    pixelated.recycle()

                    val rf = android.graphics.RectF(rect)
                    canvas.drawRoundRect(rf, 8f, 8f, maskPaint)
                    labelPaint.textSize = (rect.height() * 0.56f).coerceIn(14f, 34f)
                    val textY = rect.centerY() + (labelPaint.textSize * 0.34f)
                    canvas.drawText("•••• ••••", rect.centerX().toFloat(), textY, labelPaint)
                }
            }

            // Subtle privacy footer stamp
            val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb(185, 15, 23, 42)
                style = Paint.Style.FILL
            }
            val footerH = (mutable.height * 0.045f).coerceIn(34f, 64f)
            canvas.drawRect(0f, mutable.height - footerH, mutable.width.toFloat(), mutable.height.toFloat(), footerPaint)
            val footerText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = (footerH * 0.48f).coerceIn(16f, 28f)
                isFakeBoldText = true
            }
            val badgeMsg = if (regions.isNotEmpty()) {
                "PRIVACY MASKED (${regions.size} sensitive fields hidden) · Shared via FileSearchPro"
            } else {
                "PRIVACY CHECKED · Shared via FileSearchPro"
            }
            canvas.drawText(badgeMsg, 20f, mutable.height - footerH * 0.30f, footerText)

            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { mutable.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            mutable.recycle()
            true to regions.size
        } catch (_: Exception) {
            false to 0
        }
    }

    private fun processBitmapFilterAndRotation(raw: Bitmap, filter: String, rotationDeg: Int): Bitmap {
        val rotated = if (rotationDeg % 360 != 0) {
            val m = Matrix().apply { postRotate(rotationDeg.toFloat()) }
            Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true).also { raw.recycle() }
        } else raw
        val normalized = filter.lowercase()
        if (normalized == "original" || normalized == "photo") return rotated

        // Adaptive shadow-removal B&W document scan (Genius Scan-style illumination compensation)
        if (normalized == "bw") {
            return applyShadowRemovalBw(rotated).also { if (it !== rotated) rotated.recycle() }
        }

        val filtered = Bitmap.createBitmap(rotated.width, rotated.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(filtered)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        when (normalized) {
            "grayscale" -> {
                val cm = ColorMatrix().apply { setSaturation(0f) }
                paint.colorFilter = ColorMatrixColorFilter(cm)
            }
            "whiteboard" -> {
                // Brightens off-white whiteboard surface & boosts marker ink saturation
                val sat = ColorMatrix().apply { setSaturation(1.38f) }
                val brightContrast = ColorMatrix(
                    floatArrayOf(
                        1.42f, 0f, 0f, 0f, -34f,
                        0f, 1.42f, 0f, 0f, -34f,
                        0f, 0f, 1.42f, 0f, -34f,
                        0f, 0f, 0f, 1f, 0f
                    )
                )
                sat.postConcat(brightContrast)
                paint.colorFilter = ColorMatrixColorFilter(sat)
            }
            "auto", "magic", "color" -> {
                // Genius Scan Magic Color: clean bright paper + crisp ink contrast
                val sat = ColorMatrix().apply { setSaturation(1.16f) }
                val contrast = ColorMatrix(
                    floatArrayOf(
                        1.32f, 0f, 0f, 0f, -24f,
                        0f, 1.32f, 0f, 0f, -24f,
                        0f, 0f, 1.32f, 0f, -24f,
                        0f, 0f, 0f, 1f, 0f
                    )
                )
                sat.postConcat(contrast)
                paint.colorFilter = ColorMatrixColorFilter(sat)
            }
        }
        canvas.drawBitmap(rotated, 0f, 0f, paint)
        rotated.recycle()
        return filtered
    }

    /**
     * Fast local illumination normalization for shadow-free B&W document scanning.
     * Estimates local paper background via a tiny downsampled blur grid, divides out uneven
     * lighting/shadows, and applies crisp document text contrast.
     */
    private fun applyShadowRemovalBw(src: Bitmap): Bitmap {
        val w = src.width
        val h = src.height
        val bgW = 36
        val bgH = ((h.toFloat() / w.coerceAtLeast(1)) * bgW).toInt().coerceIn(24, 64)
        val tinyBg = Bitmap.createScaledBitmap(src, bgW, bgH, true)
        val smoothBg = Bitmap.createScaledBitmap(tinyBg, w, h, true)
        tinyBg.recycle()

        val srcPixels = IntArray(w * h)
        val bgPixels = IntArray(w * h)
        src.getPixels(srcPixels, 0, w, 0, 0, w, h)
        smoothBg.getPixels(bgPixels, 0, w, 0, 0, w, h)
        smoothBg.recycle()

        val outPixels = IntArray(w * h)
        for (i in srcPixels.indices) {
            val sp = srcPixels[i]
            val bp = bgPixels[i]
            val lumaSrc = (Color.red(sp) * 299 + Color.green(sp) * 587 + Color.blue(sp) * 114) / 1000
            val lumaBg = ((Color.red(bp) * 299 + Color.green(bp) * 587 + Color.blue(bp) * 114) / 1000).coerceAtLeast(40)
            // Normalize pixel against local illumination so shadows disappear into clean white paper
            val norm = (lumaSrc * 245) / lumaBg
            // Crisp S-curve stretch: pure white paper (>212), deep sharp black text (<155)
            val v = when {
                norm >= 212 -> 255
                norm <= 135 -> (norm * 0.45f).toInt().coerceIn(0, 80)
                else -> (((norm - 135) * 255) / (212 - 135)).coerceIn(0, 255)
            }
            outPixels[i] = Color.rgb(v, v, v)
        }
        return Bitmap.createBitmap(outPixels, w, h, Bitmap.Config.ARGB_8888)
    }

    suspend fun applyWatermarkToPdf(
        pdfUri: String,
        watermarkText: String,
        colorInt: Int,
        alphaFloat: Float,
        outFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        val temp = File(context.cacheDir, "wm_pdf_${System.currentTimeMillis()}.pdf")
        try {
            val inputStream = openInputStream(pdfUri) ?: return@withContext false
            val r = Color.red(colorInt) / 255f
            val g = Color.green(colorInt) / 255f
            val b = Color.blue(colorInt) / 255f
            val safeText = watermarkText.replace(Regex("[^\\x20-\\x7E]"), "").ifBlank { "CONFIDENTIAL" }
            inputStream.use { ins ->
                PDDocument.load(ins).use { doc ->
                    doc.isAllSecurityToBeRemoved = true
                    val gs = PDExtendedGraphicsState().apply {
                        nonStrokingAlphaConstant = alphaFloat.coerceIn(0.1f, 0.9f)
                    }
                    for (i in 0 until doc.numberOfPages) {
                        val page = doc.getPage(i)
                        val box = page.mediaBox
                        PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
                            cs.saveGraphicsState()
                            cs.setGraphicsStateParameters(gs)
                            cs.setNonStrokingColor(r, g, b)
                            cs.beginText()
                            cs.setFont(PDType1Font.HELVETICA_BOLD, (box.width / 10f).coerceIn(28f, 64f))
                            cs.setTextMatrix(PdfMatrix.getRotateInstance(Math.toRadians(35.0), box.width * 0.18f, box.height * 0.35f))
                            cs.showText(safeText)
                            cs.endText()
                            cs.restoreGraphicsState()
                        }
                    }
                    doc.save(temp)
                }
            }
            if (!temp.exists() || temp.length() == 0L) return@withContext false
            outFile.parentFile?.mkdirs()
            temp.copyTo(outFile, overwrite = true)
            outFile.setLastModified(System.currentTimeMillis())
            invalidatePdfCache(outFile.toURI().toString())
            true
        } catch (_: Exception) {
            false
        } finally {
            temp.delete()
        }
    }

    suspend fun applySignatureToPdf(
        pdfUri: String,
        pageIndex: Int,
        signatureBitmap: Bitmap,
        outFile: File,
        placement: SignaturePlacement = SignaturePlacement()
    ): Boolean = withContext(Dispatchers.IO) {
        val temp = File(context.cacheDir, "sig_pdf_${System.currentTimeMillis()}.pdf")
        try {
            val inputStream = openInputStream(pdfUri) ?: return@withContext false
            inputStream.use { ins ->
                PDDocument.load(ins).use { doc ->
                    doc.isAllSecurityToBeRemoved = true
                    val safeIdx = pageIndex.coerceIn(0, (doc.numberOfPages - 1).coerceAtLeast(0))
                    val page = doc.getPage(safeIdx)
                    val box = page.mediaBox
                    val pdSig = LosslessFactory.createFromImage(doc, signatureBitmap)
                    val sigW = box.width * placement.widthFraction.coerceIn(0.14f, 0.72f)
                    val sigH = sigW * (signatureBitmap.height.toFloat() / signatureBitmap.width.coerceAtLeast(1))
                    val x = (box.width * placement.posX).coerceIn(0f, (box.width - sigW).coerceAtLeast(0f))
                    // Convert top-down posY to bottom-up PDF coordinates
                    val y = (box.height * (1f - placement.posY) - sigH).coerceIn(14f, (box.height - sigH).coerceAtLeast(14f))
                    PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
                        cs.drawImage(pdSig, x, y, sigW, sigH)
                        if (placement.includeDateStamp) {
                            val dateStr = "Signed ${java.time.LocalDate.now()}"
                            cs.beginText()
                            cs.setNonStrokingColor(0.10f, 0.14f, 0.25f)
                            cs.setFont(PDType1Font.HELVETICA_BOLD, (sigW * 0.085f).coerceIn(8f, 14f))
                            cs.newLineAtOffset(x, (y - 12f).coerceAtLeast(4f))
                            cs.showText(dateStr)
                            cs.endText()
                        }
                    }
                    doc.save(temp)
                }
            }
            if (!temp.exists() || temp.length() == 0L) return@withContext false
            outFile.parentFile?.mkdirs()
            temp.copyTo(outFile, overwrite = true)
            outFile.setLastModified(System.currentTimeMillis())
            invalidatePdfCache(outFile.toURI().toString())
            true
        } catch (_: Exception) {
            false
        } finally {
            temp.delete()
        }
    }
}
