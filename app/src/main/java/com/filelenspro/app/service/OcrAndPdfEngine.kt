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
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.text.PDFTextStripper
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

    suspend fun getPdfThumbnailPath(uriString: String): String? = withContext(Dispatchers.IO) {
        val cacheDir = File(context.cacheDir, "pdf_thumbs").apply { mkdirs() }
        val outFile = File(cacheDir, "thumb_${abs(uriString.hashCode())}.jpg")
        if (outFile.exists() && outFile.length() > 0) return@withContext outFile.absolutePath

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
        val docDir = File(cacheRoot, "doc_${abs(uriString.hashCode())}").apply {
            if (forceRefresh) deleteRecursively()
            mkdirs()
        }
        val outPaths = mutableListOf<String>()
        synchronized(renderLock) {
            try {
                PdfRenderer(pfd).use { renderer ->
                    val end = (offset + limit).coerceAtMost(renderer.pageCount)
                    for (i in offset until end) {
                        val pageFile = File(docDir, "p_$i.jpg")
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
        rotations: List<Int> = emptyList()
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            outputFile.parentFile?.mkdirs()
            PDDocument().use { doc ->
                imageUris.forEachIndexed { idx, uri ->
                    var bmp = decodeSampledBitmap(uri, 2000) ?: return@forEachIndexed
                    val rot = rotations.getOrElse(idx) { 0 } % 360
                    if (rot != 0) {
                        val m = Matrix().apply { postRotate(rot.toFloat()) }
                        val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
                        bmp.recycle()
                        bmp = rotated
                    }
                    val pageWidth = PDRectangle.A4.width
                    val pageHeight = pageWidth * (bmp.height.toFloat() / bmp.width.coerceAtLeast(1))
                    val page = PDPage(PDRectangle(pageWidth, pageHeight))
                    doc.addPage(page)
                    val pdImage = JPEGFactory.createFromImage(doc, bmp, 0.88f)
                    PDPageContentStream(doc, page).use { cs ->
                        cs.drawImage(pdImage, 0f, 0f, pageWidth, pageHeight)
                    }
                    bmp.recycle()
                }
                doc.save(outputFile)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun buildIdCard2In1Pdf(
        frontUri: String,
        backUri: String?,
        outputFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            outputFile.parentFile?.mkdirs()
            PDDocument().use { doc ->
                val page = PDPage(PDRectangle.A4)
                doc.addPage(page)
                val pw = PDRectangle.A4.width
                val ph = PDRectangle.A4.height
                val cardW = pw * 0.72f
                val cardH = cardW * 0.63f
                val leftX = (pw - cardW) / 2f

                PDPageContentStream(doc, page).use { cs ->
                    decodeSampledBitmap(frontUri, 1600)?.let { frontBmp ->
                        val frontImg = JPEGFactory.createFromImage(doc, frontBmp, 0.90f)
                        cs.drawImage(frontImg, leftX, ph - cardH - 80f, cardW, cardH)
                        cs.setStrokingColor(37, 99, 235)
                        cs.setLineWidth(1.5f)
                        cs.addRect(leftX, ph - cardH - 80f, cardW, cardH)
                        cs.stroke()
                        frontBmp.recycle()
                    }
                    if (!backUri.isNullOrBlank()) {
                        decodeSampledBitmap(backUri, 1600)?.let { backBmp ->
                            val backImg = JPEGFactory.createFromImage(doc, backBmp, 0.90f)
                            cs.drawImage(backImg, leftX, ph - (cardH * 2f) - 130f, cardW, cardH)
                            cs.setStrokingColor(37, 99, 235)
                            cs.setLineWidth(1.5f)
                            cs.addRect(leftX, ph - (cardH * 2f) - 130f, cardW, cardH)
                            cs.stroke()
                            backBmp.recycle()
                        }
                    }
                }
                doc.save(outputFile)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    suspend fun rotatePdfPages(pdfUri: String, pageRotations: Map<Int, Int>, outFile: File): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val temp = File(context.cacheDir, "rot_${System.currentTimeMillis()}.pdf")
                openInputStream(pdfUri)?.use { ins ->
                    PDDocument.load(ins).use { doc ->
                        pageRotations.forEach { (idx, deg) ->
                            if (idx in 0 until doc.numberOfPages) {
                                val p = doc.getPage(idx)
                                p.rotation = (p.rotation + deg + 360) % 360
                            }
                        }
                        doc.save(temp)
                    }
                }
                temp.copyTo(outFile, overwrite = true)
                temp.delete()
                true
            } catch (_: Exception) {
                false
            }
        }

    suspend fun deletePdfPages(pdfUri: String, deleteIndices: Set<Int>, outFile: File): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val temp = File(context.cacheDir, "del_${System.currentTimeMillis()}.pdf")
                openInputStream(pdfUri)?.use { ins ->
                    PDDocument.load(ins).use { doc ->
                        if (deleteIndices.size >= doc.numberOfPages) return@withContext false
                        deleteIndices.sortedDescending().forEach { idx ->
                            if (idx in 0 until doc.numberOfPages) doc.removePage(idx)
                        }
                        doc.save(temp)
                    }
                }
                temp.copyTo(outFile, overwrite = true)
                temp.delete()
                true
            } catch (_: Exception) {
                false
            }
        }

    suspend fun reorderPdfPages(pdfUri: String, newOrder: List<Int>, outFile: File): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val temp = File(context.cacheDir, "reord_${System.currentTimeMillis()}.pdf")
                openInputStream(pdfUri)?.use { ins ->
                    PDDocument.load(ins).use { src ->
                        PDDocument().use { dst ->
                            newOrder.forEach { idx ->
                                if (idx in 0 until src.numberOfPages) {
                                    dst.importPage(src.getPage(idx))
                                }
                            }
                            dst.save(temp)
                        }
                    }
                }
                temp.copyTo(outFile, overwrite = true)
                temp.delete()
                true
            } catch (_: Exception) {
                false
            }
        }

    suspend fun extractPdfPages(pdfUri: String, indices: List<Int>, outFile: File): Boolean =
        reorderPdfPages(pdfUri, indices, outFile)

    suspend fun mergePdfs(pdfUris: List<String>, outFile: File): Boolean = withContext(Dispatchers.IO) {
        try {
            val merger = PDFMergerUtility()
            val tempInputs = mutableListOf<File>()
            pdfUris.forEachIndexed { i, uri ->
                val tmp = File(context.cacheDir, "merge_in_${i}_${System.currentTimeMillis()}.pdf")
                openInputStream(uri)?.use { ins -> FileOutputStream(tmp).use { ins.copyTo(it) } }
                if (tmp.exists() && tmp.length() > 0) {
                    tempInputs.add(tmp)
                    merger.addSource(tmp)
                }
            }
            outFile.parentFile?.mkdirs()
            merger.destinationFileName = outFile.absolutePath
            merger.mergeDocuments(com.tom_roush.pdfbox.io.MemoryUsageSetting.setupMainMemoryOnly())
            tempInputs.forEach { it.delete() }
            true
        } catch (_: Exception) {
            false
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

    suspend fun applySignatureToImage(
        uriString: String,
        signatureBitmap: Bitmap,
        outFile: File
    ): Boolean = withContext(Dispatchers.IO) {
        val bmp = decodeSampledBitmap(uriString, 2000) ?: return@withContext false
        try {
            val mutable = bmp.copy(Bitmap.Config.ARGB_8888, true)
            bmp.recycle()
            val canvas = Canvas(mutable)
            val sigW = (mutable.width * 0.34f).toInt().coerceAtLeast(120)
            val sigH = (sigW * (signatureBitmap.height.toFloat() / signatureBitmap.width.coerceAtLeast(1))).toInt()
            val scaledSig = Bitmap.createScaledBitmap(signatureBitmap, sigW, sigH, true)
            val left = mutable.width - sigW - (mutable.width * 0.08f)
            val top = mutable.height - sigH - (mutable.height * 0.08f)
            canvas.drawBitmap(scaledSig, left, top, null)
            scaledSig.recycle()
            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { mutable.compress(Bitmap.CompressFormat.JPEG, 92, it) }
            mutable.recycle()
            true
        } catch (_: Exception) {
            false
        }
    }
}
