package expo.modules.pdftoimage

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.os.StatFs
import android.media.MediaActionSound
import android.media.MediaScannerConnection
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.os.storage.StorageManager
import android.net.wifi.WifiManager
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.io.MemoryUsageSetting

class ExpoPdfToImageModule : Module() {
    companion object {
        val renderLock = Any()
        private var mediaActionSound: MediaActionSound? = null
        val thumbnailMemoryCache = java.util.concurrent.ConcurrentHashMap<String, String>()
        val ocrExecutor = java.util.concurrent.Executors.newFixedThreadPool(2)

        fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
            val height = options.outHeight
            val width = options.outWidth
            var inSampleSize = 1
            if (height > reqHeight || width > reqWidth) {
                val halfHeight = height / 2
                val halfWidth = width / 2
                while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                    inSampleSize *= 2
                }
            }
            return inSampleSize
        }

        fun decodeSampledBitmapFromFile(path: String, maxDim: Int = 1600): Bitmap? {
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(path, options)
            if (options.outWidth <= 0 || options.outHeight <= 0) return null

            options.inSampleSize = calculateInSampleSize(options, maxDim, maxDim)
            options.inJustDecodeBounds = false
            return try {
                BitmapFactory.decodeFile(path, options)
            } catch (oom: OutOfMemoryError) {
                System.gc()
                options.inSampleSize *= 2
                try {
                    BitmapFactory.decodeFile(path, options)
                } catch (_: Throwable) {
                    null
                }
            }
        }
    }

    private var pendingScanPromise: expo.modules.kotlin.Promise? = null
    private val SCANNER_REQUEST_CODE = 8842
    private var lanHttpServer: LanHttpServer? = null
    private var lanFtpServer: LanFtpServer? = null

    private fun getLocalWifiIp(context: Context): String? {
        try {
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            if (wm != null && wm.isWifiEnabled) {
                val ipInt = wm.connectionInfo?.ipAddress ?: 0
                if (ipInt != 0) {
                    return String.format(
                        Locale.US,
                        "%d.%d.%d.%d",
                        ipInt and 0xff,
                        (ipInt shr 8) and 0xff,
                        (ipInt shr 16) and 0xff,
                        (ipInt shr 24) and 0xff
                    )
                }
            }
        } catch (_: Exception) {}

        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val nif = interfaces.nextElement()
                val addrs = nif.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        val host = addr.hostAddress
                        if (host != null && (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172."))) {
                            return host
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return null
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoPdfToImage")

        Events(
            "onSpeechPartialResult",
            "onSpeechFinalResult",
            "onSpeechStateChange",
            "onSpeechError"
        )

        AsyncFunction("renderPdfToImages") { pdfUri: String, rotations: List<Int>?, offset: Int?, limit: Int?, maxDimArg: Int? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val results = mutableListOf<String>()

            val pfd: ParcelFileDescriptor = when {
                pdfUri.startsWith("content://") -> {
                    val parsedUri = Uri.parse(pdfUri)
                    context.contentResolver.openFileDescriptor(parsedUri, "r")
                        ?: throw Exception("Cannot open content URI: $pdfUri")
                }
                pdfUri.startsWith("file://") -> {
                    var cleanPath = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                    var file = File(cleanPath)
                    if (!file.exists() && cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            file = File(decoded)
                            cleanPath = decoded
                        }
                    }
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
                else -> {
                    var cleanPath = pdfUri
                    var file = File(cleanPath)
                    if (!file.exists() && cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            file = File(decoded)
                            cleanPath = decoded
                        }
                    }
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
            }

            val pdfRenderer = try {
                PdfRenderer(pfd)
            } catch (e: SecurityException) {
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction emptyList<String>()
            } catch (e: Exception) {
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction emptyList<String>()
            }
            val pageCount = pdfRenderer.pageCount

            var fileModTime: Long = 0L
            var fileSize: Long = 0L
            if (pdfUri.startsWith("file://")) {
                val f = File(Uri.parse(pdfUri).path ?: "")
                if (f.exists()) {
                    fileModTime = f.lastModified()
                    fileSize = f.length()
                }
            } else if (!pdfUri.startsWith("content://")) {
                val f = File(pdfUri)
                if (f.exists()) {
                    fileModTime = f.lastModified()
                    fileSize = f.length()
                }
            } else {
                fileSize = pfd.statSize
            }

            val normUri = if (pdfUri.startsWith("file://")) pdfUri else if (pdfUri.startsWith("content://")) pdfUri else "file://$pdfUri"
            val rotKey = if (rotations == null || rotations.isEmpty() || rotations.all { it % 360 == 0 }) "0" else rotations.joinToString(",") { ((it % 360 + 360) % 360).toString() }
            val docKey = "doc_" + Math.abs(normUri.hashCode()) + "_" + fileSize + "_" + fileModTime + "_r" + Math.abs(rotKey.hashCode())
            val cacheDir = File(context.cacheDir, "pdf_images")

            val startIndex = Math.max(0, offset ?: 0)
            val countToRender = if (limit != null && limit > 0) limit else (pageCount - startIndex)
            val endIndex = Math.min(pageCount, Math.max(startIndex, startIndex + countToRender))

            synchronized(renderLock) {
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs()
                }
                val docCacheDir = File(cacheDir, docKey)

                // High-speed RAM & CPU cache hit: return already rendered slice instantly in 0ms
                if (docCacheDir.exists()) {
                    val neededFiles = (startIndex until endIndex).map { File(docCacheDir, "p_$it.jpg") }
                    if (neededFiles.isNotEmpty() && neededFiles.all { it.exists() && it.length() > 0 }) {
                        try { pdfRenderer.close() } catch (_: Exception) {}
                        try { pfd.close() } catch (_: Exception) {}
                        return@AsyncFunction neededFiles.map { "file://" + it.absolutePath }
                    }
                } else {
                    docCacheDir.mkdirs()
                }

                fun renderPageAtIndex(idx: Int): String {
                    val outputFile = File(docCacheDir, "p_$idx.jpg")
                    if (outputFile.exists() && outputFile.length() > 0) {
                        return "file://" + outputFile.absolutePath
                    }

                    val page = pdfRenderer.openPage(idx)
                    val pageRot = ((rotations?.getOrNull(idx) ?: 0) % 360 + 360) % 360
                    val isSwapped = (pageRot == 90 || pageRot == 270)
                    val origPageW = if (isSwapped) page.height else page.width
                    val origPageH = if (isSwapped) page.width else page.height

                    val maxDim = if (maxDimArg != null && maxDimArg > 0) Math.min(maxDimArg, 1600) else 1600
                    val scaleMultiplier = if (maxDim <= 720) 1.2f else 2.0f
                    var targetWidth = (origPageW * scaleMultiplier).toInt()
                    var targetHeight = (origPageH * scaleMultiplier).toInt()
                    if (targetWidth > maxDim || targetHeight > maxDim) {
                        val ratio = Math.min(maxDim.toFloat() / targetWidth, maxDim.toFloat() / targetHeight)
                        targetWidth = Math.max(1, (targetWidth * ratio).toInt())
                        targetHeight = Math.max(1, (targetHeight * ratio).toInt())
                    }
                    targetWidth = Math.max(1, targetWidth)
                    targetHeight = Math.max(1, targetHeight)

                    // Android PdfRenderer strictly requires ARGB_8888 (throws IllegalArgumentException on RGB_565)
                    val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)

                    val matrix = Matrix()
                    val scaleX = targetWidth.toFloat() / (if (isSwapped) page.height else page.width).toFloat()
                    val scaleY = targetHeight.toFloat() / (if (isSwapped) page.width else page.height).toFloat()
                    matrix.postScale(scaleX, scaleY)

                    if (pageRot != 0) {
                        matrix.postRotate(pageRot.toFloat())
                        when (pageRot) {
                            90 -> matrix.postTranslate(targetWidth.toFloat(), 0f)
                            180 -> matrix.postTranslate(targetWidth.toFloat(), targetHeight.toFloat())
                            270 -> matrix.postTranslate(0f, targetHeight.toFloat())
                        }
                    }

                    try {
                        page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        page.close()

                        val out = FileOutputStream(outputFile)
                        val quality = if (maxDim <= 720) 78 else 85
                        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
                        out.flush()
                        out.close()
                    } finally {
                        bitmap.recycle()
                    }

                    return "file://" + outputFile.absolutePath
                }

                try {
                    for (i in startIndex until endIndex) {
                        results.add(renderPageAtIndex(i))
                    }
                } finally {
                    try { pdfRenderer.close() } catch (_: Exception) {}
                    try { pfd.close() } catch (_: Exception) {}
                }

                return@AsyncFunction results
            }
        }

        AsyncFunction("getPdfPagesInfo") { pdfUri: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val pfd: ParcelFileDescriptor = when {
                pdfUri.startsWith("content://") -> {
                    val parsedUri = Uri.parse(pdfUri)
                    context.contentResolver.openFileDescriptor(parsedUri, "r")
                        ?: throw Exception("Cannot open content URI: $pdfUri")
                }
                pdfUri.startsWith("file://") -> {
                    var cleanPath = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                    var file = File(cleanPath)
                    if (!file.exists() && cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            file = File(decoded)
                            cleanPath = decoded
                        }
                    }
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
                else -> {
                    var cleanPath = pdfUri
                    var file = File(cleanPath)
                    if (!file.exists() && cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            file = File(decoded)
                            cleanPath = decoded
                        }
                    }
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
            }

            val pdfRenderer = try {
                PdfRenderer(pfd)
            } catch (e: Exception) {
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction emptyList<Map<String, Any>>()
            }

            val count = pdfRenderer.pageCount
            val results = ArrayList<Map<String, Any>>(count)
            try {
                for (i in 0 until count) {
                    val page = pdfRenderer.openPage(i)
                    val w = page.width
                    val h = page.height
                    page.close()
                    results.add(mapOf(
                        "pageIndex" to i,
                        "rotation" to 0,
                        "width" to w,
                        "height" to h
                    ))
                }
            } finally {
                try { pdfRenderer.close() } catch (_: Exception) {}
                try { pfd.close() } catch (_: Exception) {}
            }

            return@AsyncFunction results
        }

        AsyncFunction("renderPdfPage") { pdfUri: String, pageIndex: Int, rotation: Int? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val pfd: ParcelFileDescriptor = when {
                pdfUri.startsWith("content://") -> {
                    val parsedUri = Uri.parse(pdfUri)
                    context.contentResolver.openFileDescriptor(parsedUri, "r")
                        ?: throw Exception("Cannot open content URI: $pdfUri")
                }
                pdfUri.startsWith("file://") -> {
                    var cleanPath = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                    var file = File(cleanPath)
                    if (!file.exists() && cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            file = File(decoded)
                            cleanPath = decoded
                        }
                    }
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
                else -> {
                    var cleanPath = pdfUri
                    var file = File(cleanPath)
                    if (!file.exists() && cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            file = File(decoded)
                            cleanPath = decoded
                        }
                    }
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
            }

            val pdfRenderer = try {
                PdfRenderer(pfd)
            } catch (e: Exception) {
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction ""
            }

            try {
                if (pageIndex < 0 || pageIndex >= pdfRenderer.pageCount) {
                    return@AsyncFunction ""
                }
                var fileModTime: Long = 0L
                var fileSize: Long = 0L
                if (pdfUri.startsWith("file://")) {
                    val f = File(Uri.parse(pdfUri).path ?: "")
                    if (f.exists()) {
                        fileModTime = f.lastModified()
                        fileSize = f.length()
                    }
                } else if (!pdfUri.startsWith("content://")) {
                    val f = File(pdfUri)
                    if (f.exists()) {
                        fileModTime = f.lastModified()
                        fileSize = f.length()
                    }
                } else {
                    fileSize = pfd.statSize
                }

                val rotVal = (rotation ?: 0) % 360
                val docKey = "doc_" + Math.abs(pdfUri.hashCode()) + "_" + fileSize + "_" + fileModTime + "_single"
                val cacheDir = File(context.cacheDir, "pdf_images")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                val docCacheDir = File(cacheDir, docKey)
                if (!docCacheDir.exists()) docCacheDir.mkdirs()

                val outputFile = File(docCacheDir, "p_${pageIndex}_r${rotVal}.jpg")
                if (outputFile.exists() && outputFile.length() > 0) {
                    return@AsyncFunction "file://" + outputFile.absolutePath
                }

                val page = pdfRenderer.openPage(pageIndex)
                val pageRot = (rotVal + 360) % 360
                val isSwapped = (pageRot == 90 || pageRot == 270)
                val origPageW = if (isSwapped) page.height else page.width
                val origPageH = if (isSwapped) page.width else page.height

                val maxDim = 1600
                var targetWidth = (origPageW * 2.0f).toInt()
                var targetHeight = (origPageH * 2.0f).toInt()
                if (targetWidth > maxDim || targetHeight > maxDim) {
                    val ratio = Math.min(maxDim.toFloat() / targetWidth, maxDim.toFloat() / targetHeight)
                    targetWidth = Math.max(1, (targetWidth * ratio).toInt())
                    targetHeight = Math.max(1, (targetHeight * ratio).toInt())
                }
                targetWidth = Math.max(1, targetWidth)
                targetHeight = Math.max(1, targetHeight)

                val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)

                val matrix = Matrix()
                val scaleX = targetWidth.toFloat() / (if (isSwapped) page.height else page.width).toFloat()
                val scaleY = targetHeight.toFloat() / (if (isSwapped) page.width else page.height).toFloat()
                matrix.postScale(scaleX, scaleY)
                if (pageRot != 0) {
                    matrix.postRotate(pageRot.toFloat(), targetWidth / 2f, targetHeight / 2f)
                }

                try {
                    page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    val out = FileOutputStream(outputFile)
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
                    out.flush()
                    out.close()
                } finally {
                    bitmap.recycle()
                }

                return@AsyncFunction "file://" + outputFile.absolutePath
            } finally {
                try { pdfRenderer.close() } catch (_: Exception) {}
                try { pfd.close() } catch (_: Exception) {}
            }
        }

        AsyncFunction("clearPdfCache") { pdfUri: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            synchronized(renderLock) {
                try {
                    val cacheDir = File(context.cacheDir, "pdf_images")
                    if (cacheDir.exists()) {
                        if (pdfUri == null) {
                            cacheDir.deleteRecursively()
                        } else {
                            val uriHash = Math.abs(pdfUri.hashCode()).toString()
                            cacheDir.listFiles()?.forEach { f ->
                                if (f.name.contains(uriHash)) {
                                    f.deleteRecursively()
                                }
                            }
                        }
                    }
                    true
                } catch (e: Exception) {
                    false
                }
            }
        }

        Function("playShutterSound") {
            try {
                if (mediaActionSound == null) {
                    mediaActionSound = MediaActionSound()
                }
                mediaActionSound?.play(MediaActionSound.SHUTTER_CLICK)
                true
            } catch (e: Exception) {
                try {
                    val fallback = MediaActionSound()
                    fallback.play(MediaActionSound.SHUTTER_CLICK)
                    true
                } catch (e2: Exception) {
                    false
                }
            }
        }

        Function("turnOffTorch") {
            try {
                val context = appContext.reactContext ?: return@Function false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
                        ?: return@Function false
                    for (id in cameraManager.cameraIdList) {
                        try {
                            val chars = cameraManager.getCameraCharacteristics(id)
                            val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                            if (hasFlash) {
                                cameraManager.setTorchMode(id, false)
                            }
                        } catch (_: Exception) {}
                    }
                }
                true
            } catch (e: Exception) {
                false
            }
        }

        AsyncFunction("getPdfThumbnail") { pdfUri: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val cachedMem = thumbnailMemoryCache[pdfUri]
            if (cachedMem != null) {
                val clean = if (cachedMem.startsWith("file://")) Uri.parse(cachedMem).path ?: cachedMem.substring(7) else cachedMem
                if (File(clean).exists()) {
                    return@AsyncFunction cachedMem
                }
            }

            var pfd: ParcelFileDescriptor? = null
            var pdfRenderer: PdfRenderer? = null
            try {
                val fileDescriptor = openPfd(context, pdfUri)
                pfd = fileDescriptor
                val fileSize = fileDescriptor.statSize
                val fileModTime = when {
                    pdfUri.startsWith("file://") -> {
                        val path = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                        File(path).lastModified()
                    }
                    else -> 0L
                }
                val thumbKey = "thumb_" + Math.abs(pdfUri.hashCode()) + "_" + fileSize + "_" + fileModTime
                val thumbsDir = File(context.cacheDir, "pdf_thumbnails")
                if (!thumbsDir.exists()) thumbsDir.mkdirs()

                val thumbFile = File(thumbsDir, "$thumbKey.jpg")
                if (thumbFile.exists() && thumbFile.length() > 0) {
                    val resUri = "file://" + thumbFile.absolutePath
                    thumbnailMemoryCache[pdfUri] = resUri
                    return@AsyncFunction resUri
                }

                pdfRenderer = PdfRenderer(fileDescriptor)
                if (pdfRenderer.pageCount == 0) return@AsyncFunction null

                val page = pdfRenderer.openPage(0)
                // Optimized compact thumbnail width (120px) for blazing fast decode & render
                val targetWidth = 120
                val targetHeight = Math.max(1, (120f * (page.height.toFloat() / page.width.toFloat())).toInt())

                // Android PdfRenderer strictly requires ARGB_8888 (throws IllegalArgumentException on RGB_565)
                val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)

                val matrix = Matrix()
                val scale = targetWidth.toFloat() / page.width.toFloat()
                matrix.postScale(scale, scale)

                page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val out = FileOutputStream(thumbFile)
                bitmap.compress(Bitmap.CompressFormat.JPEG, 75, out)
                out.flush()
                out.close()
                bitmap.recycle()

                val resUri = "file://" + thumbFile.absolutePath
                thumbnailMemoryCache[pdfUri] = resUri
                resUri
            } catch (e: Exception) {
                android.util.Log.e("ExpoPdfToImage", "getPdfThumbnail error for $pdfUri: ${e.message}", e)
                null
            } finally {
                try { pdfRenderer?.close() } catch (_: Exception) {}
                try { pfd?.close() } catch (_: Exception) {}
            }
        }

        AsyncFunction("zipFiles") { fileUris: List<String>, zipName: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val outDir = File(context.cacheDir, "exported_zips")
            if (!outDir.exists()) outDir.mkdirs()
            val cleanName = if (zipName.endsWith(".zip")) zipName else "$zipName.zip"
            val zipFile = File(outDir, cleanName)
            val zos = ZipOutputStream(FileOutputStream(zipFile))

            try {
                for ((idx, uriStr) in fileUris.withIndex()) {
                    val cleanPath = when {
                        uriStr.startsWith("file://") -> Uri.parse(uriStr).path ?: uriStr.substring(7)
                        else -> uriStr
                    }
                    val srcFile = File(cleanPath)
                    if (srcFile.exists() && srcFile.isFile) {
                        val entryName = "Page_${String.format(Locale.US, "%02d", idx + 1)}.jpg"
                        zos.putNextEntry(ZipEntry(entryName))
                        val fis = FileInputStream(srcFile)
                        fis.copyTo(zos)
                        fis.close()
                        zos.closeEntry()
                    }
                }
                zos.flush()
            } finally {
                zos.close()
            }

            "file://" + zipFile.absolutePath
        }

        AsyncFunction("startBackgroundService") { title: String?, message: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            try {
                FileLensBackgroundService.start(
                    context,
                    title ?: "FileLensPro",
                    message ?: "Indexing and OCR in progress..."
                )
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }

        AsyncFunction("updateBackgroundService") { title: String?, message: String?, progress: Int?, max: Int? ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            try {
                FileLensBackgroundService.update(
                    context,
                    title ?: "FileLensPro",
                    message ?: "Indexing and OCR in progress...",
                    progress ?: -1,
                    max ?: -1
                )
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }

        AsyncFunction("stopBackgroundService") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            try {
                FileLensBackgroundService.stop(context)
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }

        AsyncFunction("isBatteryOptimizationIgnored") {
            val context = appContext.reactContext ?: return@AsyncFunction true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                pm?.isIgnoringBatteryOptimizations(context.packageName) ?: true
            } else {
                true
            }
        }

        AsyncFunction("requestIgnoreBatteryOptimizations") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    true
                } else {
                    true
                }
            } catch (e: Exception) {
                try {
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    true
                } catch (ex: Exception) {
                    false
                }
            }
        }

        AsyncFunction("startVoiceCapture") { locale: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction false
            val manager = VoiceCaptureManager.instance
            manager.onPartialResult = { text ->
                sendEvent("onSpeechPartialResult", mapOf("text" to text))
            }
            manager.onFinalResult = { text ->
                sendEvent("onSpeechFinalResult", mapOf("text" to text))
            }
            manager.onStateChange = { isCapturing ->
                sendEvent("onSpeechStateChange", mapOf("isCapturing" to isCapturing))
            }
            manager.onError = { error ->
                sendEvent("onSpeechError", mapOf("error" to error))
            }
            manager.startListening(context, locale)
            true
        }

        AsyncFunction("stopVoiceCapture") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            VoiceCaptureManager.instance.stopListening(context)
            true
        }

        Function("isVoiceCaptureActive") {
            VoiceCaptureManager.instance.isCapturing()
        }

        AsyncFunction("compressPdf") { pdfUri: String, resolution: String, rotations: List<Int>? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val pfd: ParcelFileDescriptor = when {
                pdfUri.startsWith("content://") -> {
                    val parsedUri = Uri.parse(pdfUri)
                    context.contentResolver.openFileDescriptor(parsedUri, "r")
                        ?: throw Exception("Cannot open content URI: $pdfUri")
                }
                pdfUri.startsWith("file://") -> {
                    val cleanPath = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                    val file = File(cleanPath)
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
                else -> {
                    val file = File(pdfUri)
                    if (!file.exists()) throw Exception("File not found: $pdfUri")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
            }

            val pdfRenderer = try {
                PdfRenderer(pfd)
            } catch (e: Exception) {
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction pdfUri
            }

            val pageCount = pdfRenderer.pageCount
            if (pageCount == 0) {
                pdfRenderer.close()
                pfd.close()
                return@AsyncFunction pdfUri
            }

            // Quality and scale strictly according to user selection
            val (scale, jpegQuality) = when (resolution.lowercase()) {
                "small" -> Pair(0.60f, 35)    // Compact: ~40-70 KB per page
                "medium" -> Pair(0.85f, 55)   // Balanced: ~100-150 KB per page
                "large" -> Pair(1.10f, 75)    // High-Res: ~250-350 KB per page
                else -> Pair(1.35f, 88)       // Actual / Print: ~500-800 KB per page
            }

            try {
                val exportDir = File(context.cacheDir, "exports")
                if (!exportDir.exists()) exportDir.mkdirs()
                val outFile = File(exportDir, "compressed_${resolution.lowercase()}_${System.currentTimeMillis()}.pdf")
                val fos = FileOutputStream(outFile)

                val offsets = mutableListOf<Long>()
                var byteCount = 0L

                fun writeString(str: String) {
                    val b = str.toByteArray(Charsets.ISO_8859_1)
                    fos.write(b)
                    byteCount += b.size
                }

                fun writeBytes(bytes: ByteArray) {
                    fos.write(bytes)
                    byteCount += bytes.size
                }

                // PDF 1.4 Header
                writeString("%PDF-1.4\n")
                writeString("%\u00E2\u00E3\u00CF\u00D3\n")

                // Obj 1: Catalog
                offsets.add(byteCount)
                writeString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

                // Obj 2: Pages root
                val pageObjIds = (0 until pageCount).map { 3 + it * 3 }
                val kidsStr = pageObjIds.joinToString(" ") { "$it 0 R" }
                offsets.add(byteCount)
                writeString("2 0 obj\n<< /Type /Pages /Kids [$kidsStr] /Count $pageCount >>\nendobj\n")

                for (i in 0 until pageCount) {
                    val page = pdfRenderer.openPage(i)
                    val pageRot = ((rotations?.getOrNull(i) ?: 0) % 360 + 360) % 360
                    val isSwapped = (pageRot == 90 || pageRot == 270)
                    val origW = if (isSwapped) page.height else page.width
                    val origH = if (isSwapped) page.width else page.height

                    val renderW = Math.max(1, (origW * scale).toInt())
                    val renderH = Math.max(1, (origH * scale).toInt())

                    val bitmap = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)

                    val matrix = Matrix()
                    val scaleX = renderW.toFloat() / (if (isSwapped) page.height else page.width).toFloat()
                    val scaleY = renderH.toFloat() / (if (isSwapped) page.width else page.height).toFloat()
                    matrix.postScale(scaleX, scaleY)
                    if (pageRot != 0) {
                        matrix.postRotate(pageRot.toFloat())
                        when (pageRot) {
                            90 -> matrix.postTranslate(renderW.toFloat(), 0f)
                            180 -> matrix.postTranslate(renderW.toFloat(), renderH.toFloat())
                            270 -> matrix.postTranslate(0f, renderH.toFloat())
                        }
                    }
                    page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    val jpegStream = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, jpegQuality, jpegStream)
                    val jpegBytes = jpegStream.toByteArray()
                    val imgW = bitmap.width
                    val imgH = bitmap.height
                    bitmap.recycle()

                    val pageObjId = 3 + i * 3
                    val imgObjId = 3 + i * 3 + 1
                    val contentObjId = 3 + i * 3 + 2

                    // Page Object (Dimensions in standard 72 DPI PDF points)
                    offsets.add(byteCount)
                    writeString("$pageObjId 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $origW $origH] /Resources << /XObject << /Im$i $imgObjId 0 R >> >> /Contents $contentObjId 0 R >>\nendobj\n")

                    // Image XObject with direct /Filter /DCTDecode JPEG compression
                    offsets.add(byteCount)
                    writeString("$imgObjId 0 obj\n<< /Type /XObject /Subtype /Image /Width $imgW /Height $imgH /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.size} >>\nstream\n")
                    writeBytes(jpegBytes)
                    writeString("\nendstream\nendobj\n")

                    // Content stream mapping the compressed JPEG to full page bounds
                    val contentStr = "q $origW 0 0 $origH 0 0 cm /Im$i Do Q\n"
                    val contentBytes = contentStr.toByteArray(Charsets.ISO_8859_1)
                    offsets.add(byteCount)
                    writeString("$contentObjId 0 obj\n<< /Length ${contentBytes.size} >>\nstream\n")
                    writeBytes(contentBytes)
                    writeString("endstream\nendobj\n")
                }

                // Cross-reference table
                val startXref = byteCount
                val totalObjs = 3 + pageCount * 3
                writeString("xref\n0 $totalObjs\n")
                writeString("0000000000 65535 f \n")
                for (off in offsets) {
                    writeString(String.format(java.util.Locale.US, "%010d 00000 n \n", off))
                }

                writeString("trailer\n<< /Size $totalObjs /Root 1 0 R >>\n")
                writeString("startxref\n$startXref\n%%EOF\n")

                fos.flush()
                fos.close()
                pdfRenderer.close()
                pfd.close()

                return@AsyncFunction "file://" + outFile.absolutePath
            } catch (e: Exception) {
                e.printStackTrace()
                try { pdfRenderer.close() } catch (_: Exception) {}
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction pdfUri
            }
        }

        AsyncFunction("buildPdfFromImages") { imageUris: List<String>, rotations: List<Int>?, title: String?, outPath: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            if (imageUris.isEmpty()) {
                throw Exception("No image URIs provided")
            }

            val outFile = if (!outPath.isNullOrBlank()) {
                val clean = if (outPath.startsWith("file://")) Uri.parse(outPath).path ?: outPath.substring(7) else outPath
                File(clean)
            } else {
                val scansDir = File(context.filesDir, "scans")
                if (!scansDir.exists()) scansDir.mkdirs()
                val cleanTitle = (title ?: "Scan").replace(Regex("[^a-zA-Z0-9_-]"), "_")
                File(scansDir, "${cleanTitle}_${System.currentTimeMillis()}.pdf")
            }
            outFile.parentFile?.mkdirs()

            val tempFile = File(outFile.parentFile, "tmp_" + System.currentTimeMillis() + "_" + outFile.name)
            val fos = FileOutputStream(tempFile)
            try {
                val offsets = mutableListOf<Long>()
                var byteCount = 0L

                fun writeString(str: String) {
                    val b = str.toByteArray(Charsets.ISO_8859_1)
                    fos.write(b)
                    byteCount += b.size
                }

                fun writeBytes(bytes: ByteArray, len: Int = bytes.size) {
                    fos.write(bytes, 0, len)
                    byteCount += len
                }

                // PDF 1.4 Header
                writeString("%PDF-1.4\n")
                writeString("%\u00E2\u00E3\u00CF\u00D3\n")

                val pageCount = imageUris.size

                // Obj 1: Catalog
                offsets.add(byteCount)
                writeString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

                // Obj 2: Pages root
                val pageObjIds = (0 until pageCount).map { 3 + it * 3 }
                val kidsStr = pageObjIds.joinToString(" ") { "$it 0 R" }
                offsets.add(byteCount)
                writeString("2 0 obj\n<< /Type /Pages /Kids [$kidsStr] /Count $pageCount >>\nendobj\n")

                val buf = ByteArray(65536)

                for (i in 0 until pageCount) {
                    val uriStr = imageUris[i]
                    var cleanPath = when {
                        uriStr.startsWith("file://") -> Uri.parse(uriStr).path ?: uriStr.substring(7)
                        else -> uriStr
                    }
                    if (cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) {
                            cleanPath = decoded
                        }
                    }
                    val imgFile = if (!uriStr.startsWith("content://")) File(cleanPath) else null

                    val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    var exists = false
                    if (imgFile != null) {
                        for (retry in 0..3) {
                            if (imgFile.exists() && imgFile.length() > 0) {
                                BitmapFactory.decodeFile(imgFile.absolutePath, boundsOpts)
                                if (boundsOpts.outWidth > 0 && boundsOpts.outHeight > 0) {
                                    exists = true
                                    break
                                }
                            }
                            try { Thread.sleep(30) } catch (_: Exception) {}
                        }
                    } else if (uriStr.startsWith("content://")) {
                        try {
                            context.contentResolver.openInputStream(Uri.parse(uriStr))?.use { s ->
                                BitmapFactory.decodeStream(s, null, boundsOpts)
                            }
                            exists = (boundsOpts.outWidth > 0 && boundsOpts.outHeight > 0)
                        } catch (_: Exception) {}
                    }

                    var rawW = boundsOpts.outWidth
                    var rawH = boundsOpts.outHeight
                    if (rawW <= 0) rawW = 1200
                    if (rawH <= 0) rawH = 1600

                    val mimeType = boundsOpts.outMimeType ?: ""
                    val isJpeg = mimeType.contains("jpeg", ignoreCase = true) || mimeType.contains("jpg", ignoreCase = true) ||
                                 cleanPath.endsWith(".jpg", ignoreCase = true) || cleanPath.endsWith(".jpeg", ignoreCase = true)

                    val pageObjId = 3 + i * 3
                    val imgObjId = 3 + i * 3 + 1
                    val contentObjId = 3 + i * 3 + 2

                    val pageRot = ((rotations?.getOrNull(i) ?: 0) % 360 + 360) % 360
                    val rotateStr = if (pageRot != 0) " /Rotate $pageRot" else ""

                    if (isJpeg && imgFile != null && exists) {
                        // High-speed native zero-decode stream copy (100% full-resolution, lossless, ~0ms latency)
                        val pageW = rawW
                        val pageH = rawH
                        val fileLen = imgFile.length()

                        // Page Object (MediaBox matches image dimensions exactly)
                        offsets.add(byteCount)
                        writeString("$pageObjId 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $pageW $pageH]$rotateStr /Resources << /XObject << /Im$i $imgObjId 0 R >> >> /Contents $contentObjId 0 R >>\nendobj\n")

                        // Image XObject with direct /Filter /DCTDecode
                        offsets.add(byteCount)
                        writeString("$imgObjId 0 obj\n<< /Type /XObject /Subtype /Image /Width $pageW /Height $pageH /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length $fileLen >>\nstream\n")
                        val fis = FileInputStream(imgFile)
                        try {
                            var n = fis.read(buf)
                            while (n != -1) {
                                writeBytes(buf, n)
                                n = fis.read(buf)
                            }
                        } finally {
                            fis.close()
                        }
                        writeString("\nendstream\nendobj\n")

                        // Content stream mapping image to page bounds (100% page fill)
                        val contentStr = "q $pageW 0 0 $pageH 0 0 cm /Im$i Do Q\n"
                        val contentBytes = contentStr.toByteArray(Charsets.ISO_8859_1)
                        offsets.add(byteCount)
                        writeString("$contentObjId 0 obj\n<< /Length ${contentBytes.size} >>\nstream\n")
                        writeBytes(contentBytes)
                        writeString("endstream\nendobj\n")
                    } else {
                        // Decode bitmap and compress to JPEG for non-JPEG / content:// streams
                        var bmp = if (imgFile != null && exists) {
                            try { BitmapFactory.decodeFile(imgFile.absolutePath) } catch (_: Throwable) { null }
                        } else if (uriStr.startsWith("content://")) {
                            try {
                                context.contentResolver.openInputStream(Uri.parse(uriStr))?.use { s ->
                                    BitmapFactory.decodeStream(s)
                                }
                            } catch (_: Throwable) { null }
                        } else null

                        if (bmp == null) {
                            throw Exception("Failed to load page image for index $i: $uriStr")
                        }

                        val pageW = bmp.width
                        val pageH = bmp.height
                        val baos = ByteArrayOutputStream()
                        bmp.compress(Bitmap.CompressFormat.JPEG, 85, baos)
                        bmp.recycle()

                        val jpegBytes = baos.toByteArray()

                        // Page Object (MediaBox matches image dimensions exactly)
                        offsets.add(byteCount)
                        writeString("$pageObjId 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $pageW $pageH]$rotateStr /Resources << /XObject << /Im$i $imgObjId 0 R >> >> /Contents $contentObjId 0 R >>\nendobj\n")

                        // Image XObject
                        offsets.add(byteCount)
                        writeString("$imgObjId 0 obj\n<< /Type /XObject /Subtype /Image /Width $pageW /Height $pageH /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.size} >>\nstream\n")
                        writeBytes(jpegBytes)
                        writeString("\nendstream\nendobj\n")

                        // Content stream mapping image to page bounds (100% page fill)
                        val contentStr = "q $pageW 0 0 $pageH 0 0 cm /Im$i Do Q\n"
                        val contentBytes = contentStr.toByteArray(Charsets.ISO_8859_1)
                        offsets.add(byteCount)
                        writeString("$contentObjId 0 obj\n<< /Length ${contentBytes.size} >>\nstream\n")
                        writeBytes(contentBytes)
                        writeString("endstream\nendobj\n")
                    }
                }

                val hasInfo = !title.isNullOrBlank()
                val infoObjId = if (hasInfo) 3 + pageCount * 3 else null
                if (hasInfo && infoObjId != null) {
                    offsets.add(byteCount)
                    val safeTitle = title!!.replace("(", "\\(").replace(")", "\\)")
                    writeString("$infoObjId 0 obj\n<< /Title ($safeTitle) /Creator (FileLensPro) /Producer (FileLensPro Fast Engine) >>\nendobj\n")
                }

                // Cross-reference table
                val startXref = byteCount
                val totalObjs = 3 + pageCount * 3 + (if (hasInfo) 1 else 0)
                writeString("xref\n0 $totalObjs\n")
                writeString("0000000000 65535 f \n")
                for (off in offsets) {
                    writeString(String.format(Locale.US, "%010d 00000 n \n", off))
                }

                val infoStr = if (hasInfo && infoObjId != null) " /Info $infoObjId 0 R" else ""
                writeString("trailer\n<< /Size $totalObjs /Root 1 0 R$infoStr >>\n")
                writeString("startxref\n$startXref\n%%EOF\n")

                fos.flush()
            } finally {
                fos.close()
            }

            if (tempFile.exists()) {
                if (outFile.exists()) outFile.delete()
                val renamed = tempFile.renameTo(outFile)
                if (!renamed) {
                    tempFile.copyTo(outFile, overwrite = true)
                    tempFile.delete()
                }
            }

            // High-speed Cache Pre-seeding: populate docCacheDir with the source images so viewer & organizer load in 0ms!
            try {
                val finalPdfUri = "file://" + outFile.absolutePath
                val fileSize = outFile.length()
                val fileModTime = outFile.lastModified()
                val rotKey = if (rotations == null || rotations.isEmpty() || rotations.all { it % 360 == 0 }) "0" else rotations.joinToString(",") { ((it % 360 + 360) % 360).toString() }
                val docKey = "doc_" + Math.abs(finalPdfUri.hashCode()) + "_" + fileSize + "_" + fileModTime + "_r" + Math.abs(rotKey.hashCode())
                val cacheDir = File(context.cacheDir, "pdf_images")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                val docCacheDir = File(cacheDir, docKey)
                if (!docCacheDir.exists()) docCacheDir.mkdirs()

                for (i in 0 until imageUris.size) {
                    val targetCacheFile = File(docCacheDir, "p_$i.jpg")
                    if (targetCacheFile.exists() && targetCacheFile.length() > 0) continue

                    val uriStr = imageUris[i]
                    var cleanPath = when {
                        uriStr.startsWith("file://") -> Uri.parse(uriStr).path ?: uriStr.substring(7)
                        else -> uriStr
                    }
                    if (cleanPath.contains("%")) {
                        val decoded = Uri.decode(cleanPath)
                        if (File(decoded).exists()) cleanPath = decoded
                    }
                    val srcFile = File(cleanPath)
                    val pageRot = ((rotations?.getOrNull(i) ?: 0) % 360 + 360) % 360

                    if (srcFile.exists() && srcFile.length() > 0) {
                        if (pageRot == 0) {
                            try {
                                srcFile.copyTo(targetCacheFile, overwrite = true)
                            } catch (_: Exception) {}
                        } else {
                            try {
                                val bmp = BitmapFactory.decodeFile(srcFile.absolutePath)
                                if (bmp != null) {
                                    val m = Matrix()
                                    m.postRotate(pageRot.toFloat())
                                    val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
                                    val fos = FileOutputStream(targetCacheFile)
                                    rotated.compress(Bitmap.CompressFormat.JPEG, 85, fos)
                                    fos.flush()
                                    fos.close()
                                    if (rotated != bmp) rotated.recycle()
                                    bmp.recycle()
                                }
                            } catch (_: Exception) {}
                        }
                    }
                }
            } catch (cacheErr: Exception) {
                android.util.Log.w("ExpoPdfToImage", "Pre-seeding cache failed: ${cacheErr.message}")
            }

            mapOf(
                "pdfUri" to ("file://" + outFile.absolutePath),
                "byteSize" to outFile.length()
            )
        }

        AsyncFunction("exportPdfAsImages") { pdfUri: String, resolution: String, rotations: List<Int>? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val pfd: ParcelFileDescriptor = when {
                pdfUri.startsWith("content://") -> {
                    val parsedUri = Uri.parse(pdfUri)
                    context.contentResolver.openFileDescriptor(parsedUri, "r")
                        ?: throw Exception("Cannot open content URI: $pdfUri")
                }
                pdfUri.startsWith("file://") -> {
                    val cleanPath = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                    val file = File(cleanPath)
                    if (!file.exists()) throw Exception("File not found: $cleanPath")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
                else -> {
                    val file = File(pdfUri)
                    if (!file.exists()) throw Exception("File not found: $pdfUri")
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                }
            }

            val pdfRenderer = try {
                PdfRenderer(pfd)
            } catch (e: Exception) {
                try { pfd.close() } catch (_: Exception) {}
                return@AsyncFunction emptyList<String>()
            }

            val pageCount = pdfRenderer.pageCount
            val results = mutableListOf<String>()
            val (scale, jpegQuality) = when (resolution.lowercase()) {
                "small" -> Pair(0.70f, 40)
                "medium" -> Pair(0.95f, 60)
                "large" -> Pair(1.20f, 80)
                else -> Pair(1.50f, 90)
            }

            val exportDir = File(context.cacheDir, "exported_images")
            if (!exportDir.exists()) exportDir.mkdirs()

            for (i in 0 until pageCount) {
                val page = pdfRenderer.openPage(i)
                val pageRot = ((rotations?.getOrNull(i) ?: 0) % 360 + 360) % 360
                val isSwapped = (pageRot == 90 || pageRot == 270)
                val origW = if (isSwapped) page.height else page.width
                val origH = if (isSwapped) page.width else page.height

                val renderW = Math.max(1, (origW * scale).toInt())
                val renderH = Math.max(1, (origH * scale).toInt())

                val bitmap = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)

                val matrix = Matrix()
                matrix.postScale(scale, scale)
                if (pageRot != 0) {
                    matrix.postRotate(pageRot.toFloat())
                    when (pageRot) {
                        90 -> matrix.postTranslate(renderW.toFloat(), 0f)
                        180 -> matrix.postTranslate(renderW.toFloat(), renderH.toFloat())
                        270 -> matrix.postTranslate(0f, renderH.toFloat())
                    }
                }
                page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val outFile = File(exportDir, "page_${i + 1}_${System.currentTimeMillis()}.jpg")
                val fos = FileOutputStream(outFile)
                bitmap.compress(Bitmap.CompressFormat.JPEG, jpegQuality, fos)
                fos.flush()
                fos.close()
                bitmap.recycle()
                results.add("file://" + outFile.absolutePath)
            }

            pdfRenderer.close()
            pfd.close()
            results
        }

        AsyncFunction("cropAndRotateImage") { imageUri: String, relX: Double, relY: Double, relW: Double, relH: Double, rotation: Int, filter: String, skewAngle: Double? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")

            val cleanPath = when {
                imageUri.startsWith("file://") -> Uri.parse(imageUri).path ?: imageUri.substring(7)
                else -> imageUri
            }

            val inputStream = when {
                imageUri.startsWith("content://") -> context.contentResolver.openInputStream(Uri.parse(imageUri))
                else -> File(cleanPath).inputStream()
            } ?: throw Exception("Cannot open image input stream: $imageUri")

            val originalBitmap = BitmapFactory.decodeStream(inputStream)
            try { inputStream.close() } catch (_: Exception) {}
            if (originalBitmap == null) throw Exception("Failed to decode image bitmap")

            // 2. Rotate bitmap only if an explicit non-zero rotation is specified by caller
            val totalRotation = ((rotation) % 360 + 360) % 360
            val rotatedBitmap = if (totalRotation != 0) {
                val matrix = Matrix().apply { postRotate(totalRotation.toFloat()) }
                val rb = Bitmap.createBitmap(originalBitmap, 0, 0, originalBitmap.width, originalBitmap.height, matrix, true)
                if (rb != originalBitmap) {
                    originalBitmap.recycle()
                }
                rb
            } else {
                originalBitmap
            }

            val curW = rotatedBitmap.width
            val curH = rotatedBitmap.height

            // 3. Bound relative crop values strictly between 0.0 and 1.0
            val safeRelX = Math.max(0.0, Math.min(0.999, relX))
            val safeRelY = Math.max(0.0, Math.min(0.999, relY))
            val safeRelW = Math.max(0.001, Math.min(1.0 - safeRelX, relW))
            val safeRelH = Math.max(0.001, Math.min(1.0 - safeRelY, relH))

            var cropX = Math.max(0, Math.min(curW - 1, (safeRelX * curW).toInt()))
            var cropY = Math.max(0, Math.min(curH - 1, (safeRelY * curH).toInt()))
            var cropW = Math.max(1, Math.min(curW - cropX, Math.round(safeRelW * curW).toInt()))
            var cropH = Math.max(1, Math.min(curH - cropY, Math.round(safeRelH * curH).toInt()))

            // If user cropped at or very close to image boundaries (full frame/near edges), snap to full bounds
            if (safeRelX <= 0.01) {
                cropW = Math.min(curW, cropW + cropX)
                cropX = 0
            }
            if (safeRelY <= 0.01) {
                cropH = Math.min(curH, cropH + cropY)
                cropY = 0
            }
            if (safeRelX + safeRelW >= 0.99) {
                cropW = curW - cropX
            }
            if (safeRelY + safeRelH >= 0.99) {
                cropH = curH - cropY
            }

            val croppedBitmap = Bitmap.createBitmap(rotatedBitmap, cropX, cropY, cropW, cropH)
            if (croppedBitmap != rotatedBitmap) {
                rotatedBitmap.recycle()
            }

            // 3b. Intelligent Auto-Straighten: correct document angle/tilt
            val angleToStraighten = skewAngle ?: 0.0
            val straightenedBitmap = if (Math.abs(angleToStraighten) >= 0.4 && Math.abs(angleToStraighten) <= 30.0) {
                val matrix = Matrix().apply { postRotate(-angleToStraighten.toFloat()) }
                val sb = Bitmap.createBitmap(croppedBitmap, 0, 0, croppedBitmap.width, croppedBitmap.height, matrix, true)
                if (sb != croppedBitmap) {
                    croppedBitmap.recycle()
                }
                sb
            } else {
                croppedBitmap
            }

            // 4. Apply Enhancement Filters
            var finalBitmap = straightenedBitmap
            if (filter == "bw" || filter == "grayscale") {
                val bwBitmap = Bitmap.createBitmap(straightenedBitmap.width, straightenedBitmap.height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bwBitmap)
                val paint = Paint()
                val colorMatrix = ColorMatrix()
                colorMatrix.setSaturation(0f)
                if (filter == "bw") {
                    val contrast = 1.6f
                    val brightness = -20f
                    val contrastMatrix = ColorMatrix(floatArrayOf(
                        contrast, 0f, 0f, 0f, brightness,
                        0f, contrast, 0f, 0f, brightness,
                        0f, 0f, contrast, 0f, brightness,
                        0f, 0f, 0f, 1f, 0f
                    ))
                    colorMatrix.postConcat(contrastMatrix)
                }
                paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
                canvas.drawBitmap(straightenedBitmap, 0f, 0f, paint)
                if (straightenedBitmap != bwBitmap) {
                    straightenedBitmap.recycle()
                }
                finalBitmap = bwBitmap
            } else if (filter == "magic" || filter == "color") {
                val colorBitmap = Bitmap.createBitmap(straightenedBitmap.width, straightenedBitmap.height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(colorBitmap)
                val paint = Paint()
                val contrast = if (filter == "magic") 1.22f else 1.05f
                val contrastMatrix = ColorMatrix(floatArrayOf(
                    contrast, 0f, 0f, 0f, 4f,
                    0f, contrast, 0f, 0f, 4f,
                    0f, 0f, contrast, 0f, 4f,
                    0f, 0f, 0f, 1f, 0f
                ))
                paint.colorFilter = ColorMatrixColorFilter(contrastMatrix)
                canvas.drawBitmap(straightenedBitmap, 0f, 0f, paint)
                if (straightenedBitmap != colorBitmap) {
                    straightenedBitmap.recycle()
                }
                finalBitmap = colorBitmap
            }

            // 5. Output cropped image to file
            val cacheDir = File(context.cacheDir, "cropped_images")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val outFile = File(cacheDir, "cropped_${System.currentTimeMillis()}.jpg")
            val fos = FileOutputStream(outFile)
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, 92, fos)
            fos.flush()
            fos.close()
            finalBitmap.recycle()

            return@AsyncFunction "file://" + outFile.absolutePath
        }

        AsyncFunction("cropAndStraightenDocument") { imageUri: String, filter: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")

            val cleanPath = when {
                imageUri.startsWith("file://") -> Uri.parse(imageUri).path ?: imageUri.substring(7)
                else -> imageUri
            }
            val file = File(cleanPath)
            if (!file.exists()) {
                return@AsyncFunction mapOf(
                    "uri" to imageUri, "width" to 1200, "height" to 1600, "hasEdges" to false
                )
            }

            // 1. Read EXIF Orientation and original dimensions
            var exifRot = 0
            try {
                val exif = android.media.ExifInterface(cleanPath)
                val orientation = exif.getAttributeInt(
                    android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL
                )
                exifRot = when (orientation) {
                    android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } catch (_: Exception) {}

            val decodeOptions = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val rawBitmap = BitmapFactory.decodeFile(cleanPath, decodeOptions)
                ?: return@AsyncFunction mapOf("uri" to imageUri, "width" to 1200, "height" to 1600, "hasEdges" to false)

            val originalBitmap = if (exifRot != 0) {
                val rotMatrix = Matrix().apply { postRotate(exifRot.toFloat()) }
                val rb = Bitmap.createBitmap(rawBitmap, 0, 0, rawBitmap.width, rawBitmap.height, rotMatrix, true)
                if (rb != rawBitmap) rawBitmap.recycle()
                rb
            } else {
                rawBitmap
            }

            val origW = originalBitmap.width
            val origH = originalBitmap.height

            try {
                // 2. Analytical downscale for fast edge & corner detection (< 25ms)
                val targetAnalysisW = 360
                val scaleFactor = origW.toFloat() / targetAnalysisW.toFloat()
                val targetAnalysisH = Math.max(10, (origH / scaleFactor).toInt())

                val analysisBm = Bitmap.createScaledBitmap(originalBitmap, targetAnalysisW, targetAnalysisH, false)
                val aw = analysisBm.width
                val ah = analysisBm.height

                val pixels = IntArray(aw * ah)
                analysisBm.getPixels(pixels, 0, aw, 0, 0, aw, ah)
                analysisBm.recycle()

                // Extract luminance buffer
                val luma = IntArray(aw * ah)
                var sumLuma = 0L
                for (i in pixels.indices) {
                    val c = pixels[i]
                    val r = (c shr 16) and 0xFF
                    val g = (c shr 8) and 0xFF
                    val b = c and 0xFF
                    val y = (r * 299 + g * 587 + b * 114) / 1000
                    luma[i] = y
                    sumLuma += y
                }
                val avgLuma = (sumLuma / (aw * ah)).toInt()

                // Compute horizontal and vertical edge gradients
                val grad = IntArray(aw * ah)
                for (y in 1 until ah - 1) {
                    val row = y * aw
                    for (x in 1 until aw - 1) {
                        val gx = Math.abs(luma[row + x + 1] - luma[row + x - 1])
                        val gy = Math.abs(luma[row + aw + x] - luma[row - aw + x])
                        grad[row + x] = gx + gy
                    }
                }

                // Sample center luminance of the paper (center 30% area)
                var centerSum = 0L
                var centerCount = 0
                val cyMin = (ah * 0.35f).toInt()
                val cyMax = (ah * 0.65f).toInt()
                val cxMin = (aw * 0.35f).toInt()
                val cxMax = (aw * 0.65f).toInt()
                for (y in cyMin until cyMax) {
                    val row = y * aw
                    for (x in cxMin until cxMax) {
                        centerSum += luma[row + x]
                        centerCount++
                    }
                }
                val centerLuma = if (centerCount > 0) (centerSum / centerCount).toInt() else avgLuma

                // 3. Multi-Ray perimeter scanning from center outward (36 rays every 10 degrees)
                val centerX = aw / 2.0
                val centerY = ah / 2.0
                val boundaryPoints = mutableListOf<Pair<Double, Double>>()

                for (deg in 0 until 360 step 10) {
                    val rad = Math.toRadians(deg.toDouble())
                    val cosA = Math.cos(rad)
                    val sinA = Math.sin(rad)

                    var foundX = -1.0
                    var foundY = -1.0
                    var r = 10.0
                    val maxR = Math.min(centerX, centerY) * 1.35

                    while (r < maxR) {
                        val px = (centerX + r * cosA).toInt()
                        val py = (centerY + r * sinA).toInt()
                        if (px < 2 || px >= aw - 2 || py < 2 || py >= ah - 2) {
                            foundX = px.coerceIn(0, aw - 1).toDouble()
                            foundY = py.coerceIn(0, ah - 1).toDouble()
                            break
                        }

                        val idx = py * aw + px
                        val gVal = grad[idx]
                        val lVal = luma[idx]

                        // Detect strong transition from paper to desk
                        if (gVal > 22 || (lVal < centerLuma - 28)) {
                            foundX = px.toDouble()
                            foundY = py.toDouble()
                            break
                        }
                        r += 2.0
                    }

                    if (foundX >= 0 && foundY >= 0) {
                        boundaryPoints.add(Pair(foundX, foundY))
                    }
                }

                // 4. Determine 4 Corners from boundary points
                var tlX: Float = 0f
                var tlY: Float = 0f
                var trX: Float = 0f
                var trY: Float = 0f
                var brX: Float = 0f
                var brY: Float = 0f
                var blX: Float = 0f
                var blY: Float = 0f
                var hasEdges = false

                if (boundaryPoints.size >= 12) {
                    // TL: minimize (x + y)
                    val tlPt = boundaryPoints.minByOrNull { it.first + it.second }!!
                    // TR: maximize (x - y)
                    val trPt = boundaryPoints.maxByOrNull { it.first - it.second }!!
                    // BR: maximize (x + y)
                    val brPt = boundaryPoints.maxByOrNull { it.first + it.second }!!
                    // BL: minimize (x - y)
                    val blPt = boundaryPoints.minByOrNull { it.first - it.second }!!

                    tlX = (tlPt.first * scaleFactor).toFloat().coerceIn(0f, origW.toFloat())
                    tlY = (tlPt.second * scaleFactor).toFloat().coerceIn(0f, origH.toFloat())
                    trX = (trPt.first * scaleFactor).toFloat().coerceIn(0f, origW.toFloat())
                    trY = (trPt.second * scaleFactor).toFloat().coerceIn(0f, origH.toFloat())
                    brX = (brPt.first * scaleFactor).toFloat().coerceIn(0f, origW.toFloat())
                    brY = (brPt.second * scaleFactor).toFloat().coerceIn(0f, origH.toFloat())
                    blX = (blPt.first * scaleFactor).toFloat().coerceIn(0f, origW.toFloat())
                    blY = (blPt.second * scaleFactor).toFloat().coerceIn(0f, origH.toFloat())

                    val docWApprox = Math.max(Math.abs(trX - tlX), Math.abs(brX - blX))
                    val docHApprox = Math.max(Math.abs(blY - tlY), Math.abs(brY - trY))

                    if (docWApprox > origW * 0.25f && docHApprox > origH * 0.25f) {
                        hasEdges = true
                    }
                } else {
                    hasEdges = false
                }

                if (!hasEdges) {
                    val padX = origW * 0.02f
                    val padY = origH * 0.02f
                    tlX = padX
                    tlY = padY
                    trX = origW - padX
                    trY = padY
                    brX = origW - padX
                    brY = origH - padY
                    blX = padX
                    blY = origH - padY
                }

                // 5. Compute Euclidean target dimensions for the straightened document
                val widthTop = Math.hypot((trX - tlX).toDouble(), (trY - tlY).toDouble())
                val widthBottom = Math.hypot((brX - blX).toDouble(), (brY - blY).toDouble())
                val heightLeft = Math.hypot((blX - tlX).toDouble(), (blY - tlY).toDouble())
                val heightRight = Math.hypot((brX - trX).toDouble(), (brY - trY).toDouble())

                val targetW = Math.max(widthTop, widthBottom).toInt().coerceIn(300, 2400)
                val targetH = Math.max(heightLeft, heightRight).toInt().coerceIn(400, 3200)

                // 6. Perform 3D Projective Perspective Warp (setPolyToPoly)
                val warpMatrix = Matrix()
                val srcPoints = floatArrayOf(
                    tlX, tlY,
                    trX, trY,
                    brX, brY,
                    blX, blY
                )
                val dstPoints = floatArrayOf(
                    0f, 0f,
                    targetW.toFloat(), 0f,
                    targetW.toFloat(), targetH.toFloat(),
                    0f, targetH.toFloat()
                )
                warpMatrix.setPolyToPoly(srcPoints, 0, dstPoints, 0, 4)

                val warpedBitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(warpedBitmap)
                val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
                canvas.drawBitmap(originalBitmap, warpMatrix, paint)
                originalBitmap.recycle()

                // 7. Apply Document Enhancement Filters (whiten background, sharpen text)
                var finalBitmap = warpedBitmap
                if (filter == "bw" || filter == "grayscale") {
                    val bwBitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                    val bwCanvas = Canvas(bwBitmap)
                    val bwPaint = Paint()
                    val cm = ColorMatrix()
                    cm.setSaturation(0f)
                    if (filter == "bw") {
                        val contrastMatrix = ColorMatrix(floatArrayOf(
                            1.65f, 0f, 0f, 0f, -18f,
                            0f, 1.65f, 0f, 0f, -18f,
                            0f, 0f, 1.65f, 0f, -18f,
                            0f, 0f, 0f, 1f, 0f
                        ))
                        cm.postConcat(contrastMatrix)
                    }
                    bwPaint.colorFilter = ColorMatrixColorFilter(cm)
                    bwCanvas.drawBitmap(warpedBitmap, 0f, 0f, bwPaint)
                    warpedBitmap.recycle()
                    finalBitmap = bwBitmap
                } else if (filter == "magic" || filter == "color") {
                    val enhancedBitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                    val enhCanvas = Canvas(enhancedBitmap)
                    val enhPaint = Paint()
                    val contrast = if (filter == "magic") 1.25f else 1.08f
                    val brightness = if (filter == "magic") 10f else 4f
                    val contrastMatrix = ColorMatrix(floatArrayOf(
                        contrast, 0f, 0f, 0f, brightness,
                        0f, contrast, 0f, 0f, brightness,
                        0f, 0f, contrast, 0f, brightness,
                        0f, 0f, 0f, 1f, 0f
                    ))
                    enhPaint.colorFilter = ColorMatrixColorFilter(contrastMatrix)
                    enhCanvas.drawBitmap(warpedBitmap, 0f, 0f, enhPaint)
                    warpedBitmap.recycle()
                    finalBitmap = enhancedBitmap
                }

                // 8. Output warped & straightened image to cache file
                val outDir = File(context.cacheDir, "straightened_docs")
                if (!outDir.exists()) outDir.mkdirs()
                val outFile = File(outDir, "doc_${System.currentTimeMillis()}.jpg")
                val fos = FileOutputStream(outFile)
                finalBitmap.compress(Bitmap.CompressFormat.JPEG, 92, fos)
                fos.flush()
                fos.close()
                finalBitmap.recycle()

                return@AsyncFunction mapOf(
                    "uri" to ("file://" + outFile.absolutePath),
                    "width" to targetW,
                    "height" to targetH,
                    "hasEdges" to hasEdges,
                    "corners" to listOf(
                        mapOf("x" to (tlX.toDouble() / origW), "y" to (tlY.toDouble() / origH)),
                        mapOf("x" to (trX.toDouble() / origW), "y" to (trY.toDouble() / origH)),
                        mapOf("x" to (brX.toDouble() / origW), "y" to (brY.toDouble() / origH)),
                        mapOf("x" to (blX.toDouble() / origW), "y" to (blY.toDouble() / origH))
                    )
                )
            } catch (err: Exception) {
                return@AsyncFunction mapOf(
                    "uri" to imageUri,
                    "width" to origW,
                    "height" to origH,
                    "hasEdges" to false
                )
            }
        }

        AsyncFunction("extractTextFromImage") { imageUri: String, lang: String? ->
            val context = appContext.reactContext ?: return@AsyncFunction ""
            val future = ocrExecutor.submit(java.util.concurrent.Callable<String> {
                var bitmap: Bitmap? = null
                try {
                    bitmap = decodeBitmapFromUriOrPath(context, imageUri) ?: return@Callable ""
                    val inputImage = InputImage.fromBitmap(bitmap, 0)
                    var extractedText = ""

                    // 1. If language contains Hindi or Devanagari, run Devanagari recognizer first
                    val preferDevanagari = lang?.contains("hin") == true || lang?.contains("dev") == true
                    if (preferDevanagari) {
                        try {
                            val devOptions = DevanagariTextRecognizerOptions.Builder().build()
                            val devRecognizer = TextRecognition.getClient(devOptions)
                            val devTask = devRecognizer.process(inputImage)
                            val devResult = Tasks.await(devTask, 12, TimeUnit.SECONDS)
                            if (!devResult.text.isNullOrBlank()) {
                                extractedText = devResult.text
                            }
                        } catch (e: Exception) {
                            android.util.Log.w("ExpoPdfToImage", "MLKit Devanagari OCR error", e)
                        }
                    }

                    // 2. Fallback or primary Latin/Standard text recognizer
                    if (extractedText.isBlank()) {
                        try {
                            val latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
                            val latinTask = latinRecognizer.process(inputImage)
                            val latinResult = Tasks.await(latinTask, 12, TimeUnit.SECONDS)
                            if (!latinResult.text.isNullOrBlank()) {
                                extractedText = latinResult.text
                            }
                        } catch (e: Exception) {
                            android.util.Log.w("ExpoPdfToImage", "MLKit Latin OCR error", e)
                        }
                    }

                    // 3. If standard didn't catch Devanagari and we didn't try Devanagari yet, try it now
                    if (extractedText.isBlank() && !preferDevanagari) {
                        try {
                            val devOptions = DevanagariTextRecognizerOptions.Builder().build()
                            val devRecognizer = TextRecognition.getClient(devOptions)
                            val devTask = devRecognizer.process(inputImage)
                            val devResult = Tasks.await(devTask, 12, TimeUnit.SECONDS)
                            if (!devResult.text.isNullOrBlank()) {
                                extractedText = devResult.text
                            }
                        } catch (e: Exception) {
                            android.util.Log.w("ExpoPdfToImage", "MLKit Devanagari fallback error", e)
                        }
                    }

                    extractedText
                } catch (err: Exception) {
                    android.util.Log.e("ExpoPdfToImage", "extractTextFromImage worker error", err)
                    ""
                } finally {
                    try { bitmap?.recycle() } catch (_: Exception) {}
                }
            })

            try {
                return@AsyncFunction future.get(15, TimeUnit.SECONDS)
            } catch (t: Exception) {
                android.util.Log.w("ExpoPdfToImage", "extractTextFromImage timed out or failed", t)
                return@AsyncFunction ""
            }
        }

        AsyncFunction("detectDocumentEdges") { imageUri: String ->
            val context = appContext.reactContext ?: return@AsyncFunction mapOf(
                "x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0, "angle" to 0.0, "hasEdges" to false
            )

            val cleanPath = when {
                imageUri.startsWith("file://") -> Uri.parse(imageUri).path ?: imageUri.substring(7)
                else -> imageUri
            }
            val file = File(cleanPath)
            if (!file.exists()) {
                return@AsyncFunction mapOf(
                    "x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0, "angle" to 0.0, "hasEdges" to false
                )
            }

            try {
                // Read original dimensions without loading full bitmap
                val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(cleanPath, boundsOptions)
                val origW = boundsOptions.outWidth
                val origH = boundsOptions.outHeight
                if (origW <= 0 || origH <= 0) {
                    return@AsyncFunction mapOf(
                        "x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0, "angle" to 0.0, "hasEdges" to false
                    )
                }

                // Subsample for fast processing (< 25ms): aim for width ~240-320
                var sampleSize = 1
                while ((origW / sampleSize) > 320 || (origH / sampleSize) > 420) {
                    sampleSize *= 2
                }

                val decodeOptions = BitmapFactory.Options().apply {
                    inSampleSize = sampleSize
                    inPreferredConfig = Bitmap.Config.RGB_565
                }
                val sampleBm = BitmapFactory.decodeFile(cleanPath, decodeOptions) ?: return@AsyncFunction mapOf(
                    "x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0, "angle" to 0.0, "hasEdges" to false
                )

                val sw = sampleBm.width
                val sh = sampleBm.height

                // Extract grayscale luminance buffer
                val pixels = IntArray(sw * sh)
                sampleBm.getPixels(pixels, 0, sw, 0, 0, sw, sh)
                sampleBm.recycle()

                val luma = IntArray(sw * sh)
                var totalLuma = 0L
                for (i in pixels.indices) {
                    val c = pixels[i]
                    val r = (c shr 16) and 0xFF
                    val g = (c shr 8) and 0xFF
                    val b = c and 0xFF
                    val y = (r * 299 + g * 587 + b * 114) / 1000
                    luma[i] = y
                    totalLuma += y
                }
                val avgLuma = (totalLuma / (sw * sh)).toInt()

                // Ray scanning from edges inward to find document boundaries
                // Horizontal scanlines at 20%, 35%, 50%, 65%, 80%
                val yRays = intArrayOf(
                    (sh * 0.20f).toInt(),
                    (sh * 0.35f).toInt(),
                    (sh * 0.50f).toInt(),
                    (sh * 0.65f).toInt(),
                    (sh * 0.80f).toInt()
                )
                val leftEdges = mutableListOf<Int>()
                val rightEdges = mutableListOf<Int>()

                val contrastThresh = 24 // Significant difference in brightness or edge gradient

                for (y in yRays) {
                    val rowOffset = y * sw
                    // From left inward (scan up to 45% of width)
                    var foundLeft = -1
                    for (x in 2 until (sw * 0.45f).toInt()) {
                        val diff = Math.abs(luma[rowOffset + x + 2] - luma[rowOffset + x - 2])
                        val diffAvg = Math.abs(luma[rowOffset + x] - avgLuma)
                        if (diff > contrastThresh || diffAvg > 28) {
                            foundLeft = x
                            break
                        }
                    }
                    if (foundLeft != -1) leftEdges.add(foundLeft)

                    // From right inward (scan from sw - 3 down to 55% of width)
                    var foundRight = -1
                    for (x in (sw - 3) downTo (sw * 0.55f).toInt()) {
                        val diff = Math.abs(luma[rowOffset + x - 2] - luma[rowOffset + x + 2])
                        val diffAvg = Math.abs(luma[rowOffset + x] - avgLuma)
                        if (diff > contrastThresh || diffAvg > 28) {
                            foundRight = x
                            break
                        }
                    }
                    if (foundRight != -1) rightEdges.add(foundRight)
                }

                // Vertical scanlines at 20%, 35%, 50%, 65%, 80%
                val xRays = intArrayOf(
                    (sw * 0.20f).toInt(),
                    (sw * 0.35f).toInt(),
                    (sw * 0.50f).toInt(),
                    (sw * 0.65f).toInt(),
                    (sw * 0.80f).toInt()
                )
                val topEdges = mutableListOf<Pair<Int, Int>>() // (x, y)
                val bottomEdges = mutableListOf<Pair<Int, Int>>()

                for (x in xRays) {
                    // From top downward (scan up to 45% of height)
                    var foundTop = -1
                    for (y in 2 until (sh * 0.45f).toInt()) {
                        val diff = Math.abs(luma[(y + 2) * sw + x] - luma[(y - 2) * sw + x])
                        val diffAvg = Math.abs(luma[y * sw + x] - avgLuma)
                        if (diff > contrastThresh || diffAvg > 28) {
                            foundTop = y
                            break
                        }
                    }
                    if (foundTop != -1) topEdges.add(Pair(x, foundTop))

                    // From bottom upward (scan from sh - 3 down to 55% of height)
                    var foundBottom = -1
                    for (y in (sh - 3) downTo (sh * 0.55f).toInt()) {
                        val diff = Math.abs(luma[(y - 2) * sw + x] - luma[(y + 2) * sw + x])
                        val diffAvg = Math.abs(luma[y * sw + x] - avgLuma)
                        if (diff > contrastThresh || diffAvg > 28) {
                            foundBottom = y
                            break
                        }
                    }
                    if (foundBottom != -1) bottomEdges.add(Pair(x, foundBottom))
                }

                val hasClearBorders = leftEdges.size >= 2 && rightEdges.size >= 2 && topEdges.size >= 2 && bottomEdges.size >= 2

                if (!hasClearBorders) {
                    // Document covers practically entire frame
                    return@AsyncFunction mapOf(
                        "x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0, "angle" to 0.0, "hasEdges" to false
                    )
                }

                leftEdges.sort()
                rightEdges.sort()
                val sortedTopY = topEdges.map { it.second }.sorted()
                val sortedBottomY = bottomEdges.map { it.second }.sorted()

                val minSampleX = leftEdges[leftEdges.size / 4]
                val maxSampleX = rightEdges[(rightEdges.size * 3) / 4]
                val minSampleY = sortedTopY[sortedTopY.size / 4]
                val maxSampleY = sortedBottomY[(sortedBottomY.size * 3) / 4]

                // Estimate skew angle from top edge points
                var calculatedAngle = 0.0
                if (topEdges.size >= 2) {
                    val p1 = topEdges.first()
                    val p2 = topEdges.last()
                    val dx = (p2.first - p1.first).toDouble()
                    val dy = (p2.second - p1.second).toDouble()
                    if (dx > 20) {
                        val rad = Math.atan2(dy, dx)
                        val deg = Math.toDegrees(rad)
                        if (Math.abs(deg) <= 25.0) {
                            calculatedAngle = deg
                        }
                    }
                }

                // Convert to relative coordinates [0.0..1.0] with 1.5% margin padding
                val relX = Math.max(0.0, (minSampleX.toDouble() / sw) - 0.015)
                val relY = Math.max(0.0, (minSampleY.toDouble() / sh) - 0.015)
                val relRight = Math.min(1.0, (maxSampleX.toDouble() / sw) + 0.015)
                val relBottom = Math.min(1.0, (maxSampleY.toDouble() / sh) + 0.015)
                val relW = Math.max(0.2, relRight - relX)
                val relH = Math.max(0.2, relBottom - relY)

                val coversReasonableArea = (relW * relH) in 0.25..0.98

                mapOf(
                    "x" to relX,
                    "y" to relY,
                    "width" to relW,
                    "height" to relH,
                    "angle" to calculatedAngle,
                    "hasEdges" to coversReasonableArea
                )
            } catch (e: Exception) {
                mapOf(
                    "x" to 0.0, "y" to 0.0, "width" to 1.0, "height" to 1.0, "angle" to 0.0, "hasEdges" to false
                )
            }
        }

        AsyncFunction("normalizeCapturedPhoto") { imageUri: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")

            val cleanPath = when {
                imageUri.startsWith("file://") -> Uri.parse(imageUri).path ?: imageUri.substring(7)
                else -> imageUri
            }
            val file = File(cleanPath)
            if (!file.exists()) {
                return@AsyncFunction mapOf("uri" to imageUri, "width" to 1200, "height" to 1600)
            }

            var exifRot = 0
            try {
                val exif = android.media.ExifInterface(cleanPath)
                val orientation = exif.getAttributeInt(
                    android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL
                )
                exifRot = when (orientation) {
                    android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } catch (_: Exception) {}

            // Inspect bitmap dimensions without full allocation first
            val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(cleanPath, boundsOptions)
            val rawW = boundsOptions.outWidth
            val rawH = boundsOptions.outHeight

            // Preserve upright portrait orientation
            var rotationNeeded = exifRot
            if (rotationNeeded == 0 && rawW > rawH) {
                rotationNeeded = 90
            }
            if (rotationNeeded == 0) {
                // Image is already in correct original orientation!
                return@AsyncFunction mapOf(
                    "uri" to ("file://" + file.absolutePath),
                    "width" to rawW,
                    "height" to rawH
                )
            }

            // Decode full bitmap and apply rotation
            val decodeOptions = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val originalBitmap = BitmapFactory.decodeFile(cleanPath, decodeOptions)
                ?: return@AsyncFunction mapOf("uri" to imageUri, "width" to rawW, "height" to rawH)

            val matrix = Matrix()
            matrix.postRotate(rotationNeeded.toFloat())
            val rotatedBitmap = Bitmap.createBitmap(
                originalBitmap, 0, 0, originalBitmap.width, originalBitmap.height, matrix, true
            )
            if (rotatedBitmap != originalBitmap) {
                originalBitmap.recycle()
            }

            val cacheDir = File(context.cacheDir, "normalized_photos")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val outFile = File(cacheDir, "norm_${System.currentTimeMillis()}.jpg")
            val fos = FileOutputStream(outFile)
            rotatedBitmap.compress(Bitmap.CompressFormat.JPEG, 95, fos)
            fos.flush()
            fos.close()

            // Reset EXIF orientation to 1 (NORMAL) on the new file so no consumer re-rotates it
            try {
                val newExif = android.media.ExifInterface(outFile.absolutePath)
                newExif.setAttribute(
                    android.media.ExifInterface.TAG_ORIENTATION,
                    android.media.ExifInterface.ORIENTATION_NORMAL.toString()
                )
                newExif.saveAttributes()
            } catch (_: Exception) {}

            val finalW = rotatedBitmap.width
            val finalH = rotatedBitmap.height
            rotatedBitmap.recycle()

            return@AsyncFunction mapOf(
                "uri" to ("file://" + outFile.absolutePath),
                "width" to finalW,
                "height" to finalH
            )
        }

        AsyncFunction("saveToPublicDocuments") { sourcePath: String, fileName: String, mimeType: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val cleanSource = if (sourcePath.startsWith("file://")) Uri.parse(sourcePath).path ?: sourcePath.substring(7) else sourcePath
            val srcFile = File(cleanSource)
            if (!srcFile.exists()) throw Exception("Source file does not exist: $cleanSource")

            val safeName = fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = context.contentResolver
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                    put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/FileLensPro")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Files.getContentUri("external"), contentValues)
                    ?: throw Exception("Failed to create entry in Documents/FileLensPro")
                resolver.openOutputStream(uri)?.use { out ->
                    srcFile.inputStream().use { input ->
                        input.copyTo(out)
                    }
                }
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
                "Documents/FileLensPro/" + safeName
            } else {
                val docsDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "FileLensPro")
                if (!docsDir.exists()) docsDir.mkdirs()
                val destFile = File(docsDir, safeName)
                srcFile.copyTo(destFile, overwrite = true)
                MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), arrayOf(mimeType), null)
                destFile.absolutePath
            }
        }

        AsyncFunction("applyWatermarkToImage") { imageUri: String, text: String, colorHex: String, opacity: Double ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val cleanPath = when {
                imageUri.startsWith("file://") -> Uri.parse(imageUri).path ?: imageUri.substring(7)
                else -> imageUri
            }
            val file = File(cleanPath)
            if (!file.exists()) throw Exception("Image file not found: $cleanPath")

            val originalBitmap = decodeSampledBitmapFromFile(cleanPath, 1600)
                ?: BitmapFactory.decodeFile(cleanPath)
                ?: throw Exception("Failed to decode image: $cleanPath")

            val mutableBitmap = originalBitmap.copy(Bitmap.Config.ARGB_8888, true)
            if (mutableBitmap != originalBitmap) {
                originalBitmap.recycle()
            }

            val canvas = Canvas(mutableBitmap)
            val w = mutableBitmap.width.toFloat()
            val h = mutableBitmap.height.toFloat()

            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = try { Color.parseColor(colorHex) } catch (_: Exception) { Color.RED }
                alpha = ((opacity.coerceIn(0.05, 0.95)) * 255).toInt()
                textSize = Math.max(36f, w / 12f)
                textAlign = Paint.Align.CENTER
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }

            canvas.save()
            canvas.translate(w / 2f, h / 2f)
            canvas.rotate(-30f)
            canvas.drawText(text.uppercase(), 0f, paint.textSize / 3f, paint)
            canvas.restore()

            val cacheDir = File(context.cacheDir, "watermarked_pages")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val outFile = File(cacheDir, "wm_${System.currentTimeMillis()}_${(0..9999).random()}.jpg")
            val fos = FileOutputStream(outFile)
            mutableBitmap.compress(Bitmap.CompressFormat.JPEG, 82, fos)
            fos.flush()
            fos.close()
            mutableBitmap.recycle()

            "file://" + outFile.absolutePath
        }

        AsyncFunction("applyWatermarkToMultipleImages") { imageUris: List<String>, text: String, colorHex: String, opacity: Double ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val cacheDir = File(context.cacheDir, "watermarked_pages")
            if (!cacheDir.exists()) cacheDir.mkdirs()

            val parsedColor = try { Color.parseColor(colorHex) } catch (_: Exception) { Color.RED }
            val alphaVal = ((opacity.coerceIn(0.05, 0.95)) * 255).toInt()
            val upperText = text.uppercase()

            val results = mutableListOf<String>()
            for (uriStr in imageUris) {
                val originalBitmap = decodeBitmapFromUriOrPath(context, uriStr)
                if (originalBitmap == null) {
                    results.add(uriStr)
                    continue
                }

                val mutableBitmap = originalBitmap.copy(Bitmap.Config.ARGB_8888, true)
                if (mutableBitmap != originalBitmap) {
                    originalBitmap.recycle()
                }

                val canvas = Canvas(mutableBitmap)
                val w = mutableBitmap.width.toFloat()
                val h = mutableBitmap.height.toFloat()

                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = parsedColor
                    alpha = alphaVal
                    textSize = Math.max(36f, w / 12f)
                    textAlign = Paint.Align.CENTER
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }

                canvas.save()
                canvas.translate(w / 2f, h / 2f)
                canvas.rotate(-30f)
                canvas.drawText(upperText, 0f, paint.textSize / 3f, paint)
                canvas.restore()

                val outFile = File(cacheDir, "wm_${System.currentTimeMillis()}_${(0..9999).random()}.jpg")
                val fos = FileOutputStream(outFile)
                mutableBitmap.compress(Bitmap.CompressFormat.JPEG, 82, fos)
                fos.flush()
                fos.close()
                mutableBitmap.recycle()

                results.add("file://" + outFile.absolutePath)
            }
            results
        }

        AsyncFunction("applySignatureToImage") { imageUri: String, signatureUri: String, relX: Double, relY: Double, relW: Double, relH: Double ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")

            val originalBitmap = decodeBitmapFromUriOrPath(context, imageUri)
                ?: throw Exception("Failed to decode base image")
            val sigBitmap = decodeBitmapFromUriOrPath(context, signatureUri)
                ?: throw Exception("Failed to decode signature")

            val mutableBitmap = originalBitmap.copy(Bitmap.Config.ARGB_8888, true)
            if (mutableBitmap != originalBitmap) {
                originalBitmap.recycle()
            }

            val canvas = Canvas(mutableBitmap)
            val w = mutableBitmap.width.toFloat()
            val h = mutableBitmap.height.toFloat()

            val destRect = Rect(
                (relX.coerceIn(0.0, 1.0) * w).toInt(),
                (relY.coerceIn(0.0, 1.0) * h).toInt(),
                ((relX + relW).coerceIn(0.0, 1.0) * w).toInt(),
                ((relY + relH).coerceIn(0.0, 1.0) * h).toInt()
            )

            val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
            canvas.drawBitmap(sigBitmap, null, destRect, paint)
            sigBitmap.recycle()

            val cacheDir = File(context.cacheDir, "signed_pages")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val outFile = File(cacheDir, "signed_${System.currentTimeMillis()}_${(0..9999).random()}.jpg")
            val fos = FileOutputStream(outFile)
            mutableBitmap.compress(Bitmap.CompressFormat.JPEG, 82, fos)
            fos.flush()
            fos.close()
            mutableBitmap.recycle()

            "file://" + outFile.absolutePath
        }

        AsyncFunction("applyFilterToImage") { imageUri: String, filter: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            if (filter.equals("none", ignoreCase = true) || filter.equals("original", ignoreCase = true)) {
                return@AsyncFunction imageUri
            }

            val originalBitmap = decodeBitmapFromUriOrPath(context, imageUri)
                ?: throw Exception("Failed to decode image: $imageUri")

            var finalBitmap = originalBitmap
            when (filter.lowercase()) {
                "bw", "grayscale" -> {
                    val bwBitmap = Bitmap.createBitmap(originalBitmap.width, originalBitmap.height, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(bwBitmap)
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
                    val colorMatrix = ColorMatrix()
                    colorMatrix.setSaturation(0f)
                    val contrast = 1.6f
                    val brightness = -20f
                    val contrastMatrix = ColorMatrix(floatArrayOf(
                        contrast, 0f, 0f, 0f, brightness,
                        0f, contrast, 0f, 0f, brightness,
                        0f, 0f, contrast, 0f, brightness,
                        0f, 0f, 0f, 1f, 0f
                    ))
                    colorMatrix.postConcat(contrastMatrix)
                    paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
                    canvas.drawBitmap(originalBitmap, 0f, 0f, paint)
                    if (finalBitmap != bwBitmap) originalBitmap.recycle()
                    finalBitmap = bwBitmap
                }
                "color", "magic" -> {
                    val colorBitmap = Bitmap.createBitmap(originalBitmap.width, originalBitmap.height, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(colorBitmap)
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
                    val contrast = 1.25f
                    val brightness = 6f
                    val contrastMatrix = ColorMatrix(floatArrayOf(
                        contrast, 0f, 0f, 0f, brightness,
                        0f, contrast, 0f, 0f, brightness,
                        0f, 0f, contrast, 0f, brightness,
                        0f, 0f, 0f, 1f, 0f
                    ))
                    paint.colorFilter = ColorMatrixColorFilter(contrastMatrix)
                    canvas.drawBitmap(originalBitmap, 0f, 0f, paint)
                    if (finalBitmap != colorBitmap) originalBitmap.recycle()
                    finalBitmap = colorBitmap
                }
                "photo" -> {
                    val photoBitmap = Bitmap.createBitmap(originalBitmap.width, originalBitmap.height, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(photoBitmap)
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
                    val colorMatrix = ColorMatrix()
                    colorMatrix.setSaturation(1.15f)
                    val contrast = 1.08f
                    val contrastMatrix = ColorMatrix(floatArrayOf(
                        contrast, 0f, 0f, 0f, 0f,
                        0f, contrast, 0f, 0f, 0f,
                        0f, 0f, contrast, 0f, 0f,
                        0f, 0f, 0f, 1f, 0f
                    ))
                    colorMatrix.postConcat(contrastMatrix)
                    paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
                    canvas.drawBitmap(originalBitmap, 0f, 0f, paint)
                    if (finalBitmap != photoBitmap) originalBitmap.recycle()
                    finalBitmap = photoBitmap
                }
                "auto" -> {
                    val autoBitmap = Bitmap.createBitmap(originalBitmap.width, originalBitmap.height, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(autoBitmap)
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
                    val contrast = 1.35f
                    val brightness = -10f
                    val contrastMatrix = ColorMatrix(floatArrayOf(
                        contrast, 0f, 0f, 0f, brightness,
                        0f, contrast, 0f, 0f, brightness,
                        0f, 0f, contrast, 0f, brightness,
                        0f, 0f, 0f, 1f, 0f
                    ))
                    paint.colorFilter = ColorMatrixColorFilter(contrastMatrix)
                    canvas.drawBitmap(originalBitmap, 0f, 0f, paint)
                    if (finalBitmap != autoBitmap) originalBitmap.recycle()
                    finalBitmap = autoBitmap
                }
            }

            val cacheDir = File(context.cacheDir, "filtered_pages")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val outFile = File(cacheDir, "filtered_${System.currentTimeMillis()}_${(0..9999).random()}.jpg")
            val fos = FileOutputStream(outFile)
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, fos)
            fos.flush()
            fos.close()
            finalBitmap.recycle()

            "file://" + outFile.absolutePath
        }

        AsyncFunction("detectDocumentEdges") { imageUri: String ->
            val cleanPath = when {
                imageUri.startsWith("file://") -> Uri.parse(imageUri).path ?: imageUri.substring(7)
                else -> imageUri
            }
            val file = File(cleanPath)
            if (!file.exists()) {
                return@AsyncFunction mapOf("x" to 0.02, "y" to 0.02, "width" to 0.96, "height" to 0.96)
            }

            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(cleanPath, bounds)
            val origW = bounds.outWidth
            val origH = bounds.outHeight
            if (origW <= 0 || origH <= 0) {
                return@AsyncFunction mapOf("x" to 0.02, "y" to 0.02, "width" to 0.96, "height" to 0.96)
            }

            var sampleSize = 1
            while ((origW / sampleSize) > 480 || (origH / sampleSize) > 640) {
                sampleSize *= 2
            }
            val sampleOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            val sampleBm = BitmapFactory.decodeFile(cleanPath, sampleOptions)
                ?: return@AsyncFunction mapOf("x" to 0.02, "y" to 0.02, "width" to 0.96, "height" to 0.96)

            val w = sampleBm.width
            val h = sampleBm.height
            val pixels = IntArray(w * h)
            sampleBm.getPixels(pixels, 0, w, 0, 0, w, h)
            sampleBm.recycle()

            val lum = IntArray(w * h)
            val hist = IntArray(256)
            for (i in pixels.indices) {
                val c = pixels[i]
                val r = (c shr 16) and 0xFF
                val g = (c shr 8) and 0xFF
                val b = c and 0xFF
                val yVal = ((299 * r + 587 * g + 114 * b) / 1000).coerceIn(0, 255)
                lum[i] = yVal
                hist[yVal]++
            }

            val totalPixels = w * h
            var sumB: Double = 0.0
            var wB: Double = 0.0
            var maximum: Double = 0.0
            var otsuThreshold = 128
            var sum1: Double = 0.0
            for (i in 0 until 256) {
                sum1 += (i * hist[i]).toDouble()
            }

            for (i in 0 until 256) {
                wB += hist[i].toDouble()
                if (wB == 0.0) continue
                val wF = totalPixels - wB
                if (wF == 0.0) break
                sumB += (i * hist[i]).toDouble()
                val mB = sumB / wB
                val mF = (sum1 - sumB) / wF
                val between = wB * wF * (mB - mF) * (mB - mF)
                if (between > maximum) {
                    maximum = between
                    otsuThreshold = i
                }
            }

            val paperThreshold = if (otsuThreshold in 60..210) otsuThreshold else 115

            // 1. Column and Row luminance ratios
            val colPaperRatio = FloatArray(w)
            for (x in 0 until w) {
                var count = 0
                for (y in 0 until h) {
                    if (lum[y * w + x] >= paperThreshold) count++
                }
                colPaperRatio[x] = count.toFloat() / h.toFloat()
            }

            val rowPaperRatio = FloatArray(h)
            for (y in 0 until h) {
                var count = 0
                for (x in 0 until w) {
                    if (lum[y * w + x] >= paperThreshold) count++
                }
                rowPaperRatio[y] = count.toFloat() / w.toFloat()
            }

            // 2. Compute edge gradient transitions (border contrast difference between desk and document)
            val colGrad = FloatArray(w)
            for (x in 1 until w - 1) {
                var gradSum = 0L
                for (y in 0 until h) {
                    gradSum += Math.abs(lum[y * w + x + 1] - lum[y * w + x - 1])
                }
                colGrad[x] = gradSum.toFloat() / h.toFloat()
            }

            val rowGrad = FloatArray(h)
            for (y in 1 until h - 1) {
                var gradSum = 0L
                for (x in 0 until w) {
                    gradSum += Math.abs(lum[(y + 1) * w + x] - lum[(y - 1) * w + x])
                }
                rowGrad[y] = gradSum.toFloat() / w.toFloat()
            }

            val ratioCutoff = 0.15f

            // Find left edge: look for sharpest transition or paper threshold in first 40%
            var left = 0
            var maxLeftGrad = 0f
            for (x in 1 until (w * 0.40).toInt()) {
                if (colPaperRatio[x] >= ratioCutoff && colGrad[x] > maxLeftGrad) {
                    maxLeftGrad = colGrad[x]
                    left = x
                }
            }
            if (left == 0) {
                for (x in 0 until (w * 0.40).toInt()) {
                    if (colPaperRatio[x] >= ratioCutoff) {
                        left = x
                        break
                    }
                }
            }

            // Find right edge: look for sharpest transition in last 40%
            var right = w - 1
            var maxRightGrad = 0f
            for (x in (w - 2) downTo (w * 0.60).toInt()) {
                if (colPaperRatio[x] >= ratioCutoff && colGrad[x] > maxRightGrad) {
                    maxRightGrad = colGrad[x]
                    right = x
                }
            }
            if (right == w - 1) {
                for (x in (w - 1) downTo (w * 0.60).toInt()) {
                    if (colPaperRatio[x] >= ratioCutoff) {
                        right = x
                        break
                    }
                }
            }

            // Find top edge: look for sharpest transition in first 40%
            var top = 0
            var maxTopGrad = 0f
            for (y in 1 until (h * 0.40).toInt()) {
                if (rowPaperRatio[y] >= ratioCutoff && rowGrad[y] > maxTopGrad) {
                    maxTopGrad = rowGrad[y]
                    top = y
                }
            }
            if (top == 0) {
                for (y in 0 until (h * 0.40).toInt()) {
                    if (rowPaperRatio[y] >= ratioCutoff) {
                        top = y
                        break
                    }
                }
            }

            // Find bottom edge: look for sharpest transition in last 40%
            var bottom = h - 1
            var maxBottomGrad = 0f
            for (y in (h - 2) downTo (h * 0.60).toInt()) {
                if (rowPaperRatio[y] >= ratioCutoff && rowGrad[y] > maxBottomGrad) {
                    maxBottomGrad = rowGrad[y]
                    bottom = y
                }
            }
            if (bottom == h - 1) {
                for (y in (h - 1) downTo (h * 0.60).toInt()) {
                    if (rowPaperRatio[y] >= ratioCutoff) {
                        bottom = y
                        break
                    }
                }
            }

            val detectedW = right - left
            val detectedH = bottom - top
            if (detectedW < (w * 0.25) || detectedH < (h * 0.25)) {
                return@AsyncFunction mapOf("x" to 0.03, "y" to 0.03, "width" to 0.94, "height" to 0.94)
            }

            var relX = (left.toDouble() / w.toDouble()).coerceIn(0.0, 0.45)
            var relY = (top.toDouble() / h.toDouble()).coerceIn(0.0, 0.45)
            var relW = ((right - left).toDouble() / w.toDouble()).coerceIn(0.25, 1.0 - relX)
            var relH = ((bottom - top).toDouble() / h.toDouble()).coerceIn(0.25, 1.0 - relY)

            val padX = 0.008
            val padY = 0.008
            relX = Math.max(0.0, relX - padX)
            relY = Math.max(0.0, relY - padY)
            relW = Math.min(1.0 - relX, relW + padX * 2)
            relH = Math.min(1.0 - relY, relH + padY * 2)

            return@AsyncFunction mapOf(
                "x" to Math.round(relX * 1000.0) / 1000.0,
                "y" to Math.round(relY * 1000.0) / 1000.0,
                "width" to Math.round(relW * 1000.0) / 1000.0,
                "height" to Math.round(relH * 1000.0) / 1000.0
            )
        }

        OnActivityResult { _, payload ->
            if (payload.requestCode == SCANNER_REQUEST_CODE) {
                val promise = pendingScanPromise
                pendingScanPromise = null
                if (promise == null) return@OnActivityResult

                if (payload.resultCode == android.app.Activity.RESULT_OK && payload.data != null) {
                    try {
                        val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(payload.data)
                        val pageUris = scanResult?.pages?.map { it.imageUri.toString() } ?: emptyList()
                        val pdfUri = scanResult?.pdf?.uri?.toString() ?: ""
                        val pageCount = scanResult?.pdf?.pageCount ?: pageUris.size
                        promise.resolve(mapOf(
                            "success" to true,
                            "pages" to pageUris,
                            "pdfUri" to pdfUri,
                            "pageCount" to pageCount,
                            "canceled" to false
                        ))
                    } catch (e: Exception) {
                        promise.reject("SCANNER_ERROR", e.message, e)
                    }
                } else if (payload.resultCode == android.app.Activity.RESULT_CANCELED) {
                    promise.resolve(mapOf(
                        "success" to false,
                        "pages" to emptyList<String>(),
                        "pdfUri" to "",
                        "pageCount" to 0,
                        "canceled" to true
                    ))
                } else {
                    promise.reject("SCANNER_FAILED", "Document scan failed with code ${payload.resultCode}", null)
                }
            }
        }

        AsyncFunction("launchGoogleDocScanner") { promise: expo.modules.kotlin.Promise ->
            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "Current activity is null", null)
                return@AsyncFunction
            }
            pendingScanPromise = promise
            try {
                val options = GmsDocumentScannerOptions.Builder()
                    .setGalleryImportAllowed(true)
                    .setPageLimit(100)
                    .setResultFormats(
                        GmsDocumentScannerOptions.RESULT_FORMAT_JPEG,
                        GmsDocumentScannerOptions.RESULT_FORMAT_PDF
                    )
                    .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                    .build()

                val scanner = GmsDocumentScanning.getClient(options)
                scanner.getStartScanIntent(activity)
                    .addOnSuccessListener { intentSender ->
                        activity.startIntentSenderForResult(intentSender, SCANNER_REQUEST_CODE, null, 0, 0, 0)
                    }
                    .addOnFailureListener { e ->
                        pendingScanPromise = null
                        promise.reject("START_FAILED", e.message, e)
                    }
            } catch (e: Exception) {
                pendingScanPromise = null
                promise.reject("SCANNER_INIT_ERROR", e.message, e)
            }
        }

        AsyncFunction("cropAndStraightenDocument") { imageUri: String, filter: String?, orientation: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val originalBm = decodeBitmapFromUriOrPath(context, imageUri)
                ?: return@AsyncFunction mapOf(
                    "uri" to imageUri,
                    "width" to 1200,
                    "height" to 1600,
                    "hasEdges" to false
                )

            // 0. Ensure upright portrait (or requested orientation) without squashing
            var workingBm = originalBm
            val reqOrientation = orientation?.lowercase() ?: "portrait"
            if (reqOrientation == "portrait" && workingBm.width > workingBm.height) {
                val rotM = Matrix().apply { postRotate(90f) }
                val rotBm = Bitmap.createBitmap(workingBm, 0, 0, workingBm.width, workingBm.height, rotM, true)
                if (rotBm != workingBm) workingBm.recycle()
                workingBm = rotBm
            } else if (reqOrientation == "landscape" && workingBm.height > workingBm.width) {
                val rotM = Matrix().apply { postRotate(-90f) }
                val rotBm = Bitmap.createBitmap(workingBm, 0, 0, workingBm.width, workingBm.height, rotM, true)
                if (rotBm != workingBm) workingBm.recycle()
                workingBm = rotBm
            }

            val origW = workingBm.width
            val origH = workingBm.height

            // 1. Downscale to analytical resolution (width 360)
            val sampleW = 360
            val sampleH = ((origH.toFloat() / origW.toFloat()) * sampleW).toInt().coerceIn(240, 720)
            val sampleBm = Bitmap.createScaledBitmap(workingBm, sampleW, sampleH, true)

            val pixels = IntArray(sampleW * sampleH)
            sampleBm.getPixels(pixels, 0, sampleW, 0, 0, sampleW, sampleH)
            sampleBm.recycle()

            val lum = IntArray(sampleW * sampleH)
            val hist = IntArray(256)
            for (i in pixels.indices) {
                val c = pixels[i]
                val r = (c shr 16) and 0xFF
                val g = (c shr 8) and 0xFF
                val b = c and 0xFF
                val yVal = ((299 * r + 587 * g + 114 * b) / 1000).coerceIn(0, 255)
                lum[i] = yVal
                hist[yVal]++
            }

            // Otsu threshold
            val totalPixels = sampleW * sampleH
            var sumB = 0.0
            var wB = 0.0
            var maximum = 0.0
            var otsuThreshold = 128
            var sum1 = 0.0
            for (i in 0 until 256) sum1 += (i * hist[i]).toDouble()

            for (i in 0 until 256) {
                wB += hist[i].toDouble()
                if (wB == 0.0) continue
                val wF = totalPixels - wB
                if (wF == 0.0) break
                sumB += (i * hist[i]).toDouble()
                val mB = sumB / wB
                val mF = (sum1 - sumB) / wF
                val between = wB * wF * (mB - mF) * (mB - mF)
                if (between > maximum) {
                    maximum = between
                    otsuThreshold = i
                }
            }

            val paperThreshold = if (otsuThreshold in 60..210) otsuThreshold else 115

            // Adaptive desk background polarity detection (supports both white desks and dark desks)
            var borderLumSum = 0L
            var borderCount = 0
            val borderThicknessX = (sampleW * 0.05).toInt().coerceAtLeast(2)
            val borderThicknessY = (sampleH * 0.05).toInt().coerceAtLeast(2)
            for (y in 0 until sampleH) {
                for (x in 0 until sampleW) {
                    if (x < borderThicknessX || x >= sampleW - borderThicknessX || y < borderThicknessY || y >= sampleH - borderThicknessY) {
                        borderLumSum += lum[y * sampleW + x]
                        borderCount++
                    }
                }
            }
            val avgBorderLum = if (borderCount > 0) (borderLumSum / borderCount).toInt() else 128

            var centerLumSum = 0L
            var centerCount = 0
            for (y in (sampleH * 0.25).toInt() until (sampleH * 0.75).toInt()) {
                for (x in (sampleW * 0.25).toInt() until (sampleW * 0.75).toInt()) {
                    centerLumSum += lum[y * sampleW + x]
                    centerCount++
                }
            }
            val avgCenterLum = if (centerCount > 0) (centerLumSum / centerCount).toInt() else 128
            val isLightDesk = avgBorderLum > (avgCenterLum + 12)

            fun isDocPixel(yVal: Int): Boolean {
                return if (isLightDesk) {
                    yVal < Math.min(avgBorderLum - 18, paperThreshold)
                } else {
                    yVal >= Math.max(avgBorderLum + 15, paperThreshold)
                }
            }

            // Multi-gradient and luminance column/row profiles
            val colPaper = FloatArray(sampleW)
            for (x in 0 until sampleW) {
                var count = 0
                for (y in 0 until sampleH) {
                    if (isDocPixel(lum[y * sampleW + x])) count++
                }
                colPaper[x] = count.toFloat() / sampleH.toFloat()
            }
            val rowPaper = FloatArray(sampleH)
            for (y in 0 until sampleH) {
                var count = 0
                for (x in 0 until sampleW) {
                    if (isDocPixel(lum[y * sampleW + x])) count++
                }
                rowPaper[y] = count.toFloat() / sampleW.toFloat()
            }

            val colGrad = FloatArray(sampleW)
            for (x in 1 until sampleW - 1) {
                var sum = 0L
                for (y in 0 until sampleH) {
                    sum += Math.abs(lum[y * sampleW + x + 1] - lum[y * sampleW + x - 1])
                }
                colGrad[x] = sum.toFloat() / sampleH.toFloat()
            }
            val rowGrad = FloatArray(sampleH)
            for (y in 1 until sampleH - 1) {
                var sum = 0L
                for (x in 0 until sampleW) {
                    sum += Math.abs(lum[(y + 1) * sampleW + x] - lum[(y - 1) * sampleW + x])
                }
                rowGrad[y] = sum.toFloat() / sampleW.toFloat()
            }

            val cutoff = 0.16f
            var left = 0
            var maxLGrad = 0f
            for (x in 1 until (sampleW * 0.40).toInt()) {
                if (colPaper[x] >= cutoff && colGrad[x] > maxLGrad) {
                    maxLGrad = colGrad[x]
                    left = x
                }
            }
            if (left == 0) {
                for (x in 0 until (sampleW * 0.40).toInt()) {
                    if (colPaper[x] >= cutoff) { left = x; break }
                }
            }

            var right = sampleW - 1
            var maxRGrad = 0f
            for (x in (sampleW - 2) downTo (sampleW * 0.60).toInt()) {
                if (colPaper[x] >= cutoff && colGrad[x] > maxRGrad) {
                    maxRGrad = colGrad[x]
                    right = x
                }
            }
            if (right == sampleW - 1) {
                for (x in (sampleW - 1) downTo (sampleW * 0.60).toInt()) {
                    if (colPaper[x] >= cutoff) { right = x; break }
                }
            }

            var top = 0
            var maxTGrad = 0f
            for (y in 1 until (sampleH * 0.40).toInt()) {
                if (rowPaper[y] >= cutoff && rowGrad[y] > maxTGrad) {
                    maxTGrad = rowGrad[y]
                    top = y
                }
            }
            if (top == 0) {
                for (y in 0 until (sampleH * 0.40).toInt()) {
                    if (rowPaper[y] >= cutoff) { top = y; break }
                }
            }

            var bottom = sampleH - 1
            var maxBGrad = 0f
            for (y in (sampleH - 2) downTo (sampleH * 0.60).toInt()) {
                if (rowPaper[y] >= cutoff && rowGrad[y] > maxBGrad) {
                    maxBGrad = rowGrad[y]
                    bottom = y
                }
            }
            if (bottom == sampleH - 1) {
                for (y in (sampleH - 1) downTo (sampleH * 0.60).toInt()) {
                    if (rowPaper[y] >= cutoff) { bottom = y; break }
                }
            }

            val docW = right - left
            val docH = bottom - top

            val scaleX = origW.toFloat() / sampleW.toFloat()
            val scaleY = origH.toFloat() / sampleH.toFloat()

            val hasSignificantDesk = (docW > (sampleW * 0.25) && docH > (sampleH * 0.25) && (left > 4 || right < sampleW - 5 || top > 4 || bottom < sampleH - 5))

            // Compute corner points excluding desk background
            val pts = if (hasSignificantDesk) {
                val pad = 8
                val l = (left - pad).coerceAtLeast(0)
                val r = (right + pad).coerceAtMost(sampleW - 1)
                val t = (top - pad).coerceAtLeast(0)
                val b = (bottom + pad).coerceAtMost(sampleH - 1)

                floatArrayOf(
                    l * scaleX, t * scaleY,
                    r * scaleX, t * scaleY,
                    r * scaleX, b * scaleY,
                    l * scaleX, b * scaleY
                )
            } else {
                floatArrayOf(
                    0f, 0f,
                    origW.toFloat(), 0f,
                    origW.toFloat(), origH.toFloat(),
                    0f, origH.toFloat()
                )
            }
            val tlX = pts[0]
            val tlY = pts[1]
            val trX = pts[2]
            val trY = pts[3]
            val brX = pts[4]
            val brY = pts[5]
            val blX = pts[6]
            val blY = pts[7]

            // Rectified width and height
            val wTop = Math.hypot((trX - tlX).toDouble(), (trY - tlY).toDouble()).toFloat()
            val wBot = Math.hypot((brX - blX).toDouble(), (brY - blY).toDouble()).toFloat()
            val targetW = Math.max(wTop, wBot).toInt().coerceIn(400, origW)

            val hLeft = Math.hypot((blX - tlX).toDouble(), (blY - tlY).toDouble()).toFloat()
            val hRight = Math.hypot((brX - trX).toDouble(), (brY - trY).toDouble()).toFloat()
            val targetH = Math.max(hLeft, hRight).toInt().coerceIn(400, origH)

            // True 3D projective perspective warp
            val warpedBm = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(warpedBm)
            val matrix = Matrix()
            val srcPts = floatArrayOf(tlX, tlY, trX, trY, brX, brY, blX, blY)
            val dstPts = floatArrayOf(
                0f, 0f,
                targetW.toFloat(), 0f,
                targetW.toFloat(), targetH.toFloat(),
                0f, targetH.toFloat()
            )
            matrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4)

            val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
            canvas.drawBitmap(workingBm, matrix, paint)
            workingBm.recycle()

            // Apply document contrast/whitening & shadow removal filter
            val filteredBm = if (filter?.lowercase() == "bw") {
                val bwBm = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                val bwCanvas = Canvas(bwBm)
                val bwPaint = Paint(Paint.ANTI_ALIAS_FLAG)
                val cm = ColorMatrix()
                cm.setSaturation(0f)
                val contrast = 1.6f
                val brightness = -20f
                val cmContrast = ColorMatrix(floatArrayOf(
                    contrast, 0f, 0f, 0f, brightness,
                    0f, contrast, 0f, 0f, brightness,
                    0f, 0f, contrast, 0f, brightness,
                    0f, 0f, 0f, 1f, 0f
                ))
                cm.postConcat(cmContrast)
                bwPaint.colorFilter = ColorMatrixColorFilter(cm)
                bwCanvas.drawBitmap(warpedBm, 0f, 0f, bwPaint)
                warpedBm.recycle()
                bwBm
            } else {
                // "magic" / auto document whitening & shadow removal for crisp text
                val wPixels = IntArray(targetW * targetH)
                warpedBm.getPixels(wPixels, 0, targetW, 0, 0, targetW, targetH)

                val blockSize = Math.max(16, Math.min(targetW, targetH) / 20)
                val blocksX = (targetW + blockSize - 1) / blockSize
                val blocksY = (targetH + blockSize - 1) / blockSize
                val bgMax = IntArray(blocksX * blocksY)

                for (by in 0 until blocksY) {
                    val y0 = by * blockSize
                    val y1 = Math.min(y0 + blockSize, targetH)
                    for (bx in 0 until blocksX) {
                        val x0 = bx * blockSize
                        val x1 = Math.min(x0 + blockSize, targetW)
                        var maxLum = 0
                        for (y in y0 until y1) {
                            val rowOff = y * targetW
                            for (x in x0 until x1) {
                                val p = wPixels[rowOff + x]
                                val r = (p shr 16) and 0xFF
                                val g = (p shr 8) and 0xFF
                                val b = p and 0xFF
                                val l = (299 * r + 587 * g + 114 * b) / 1000
                                if (l > maxLum) maxLum = l
                            }
                        }
                        bgMax[by * blocksX + bx] = maxLum.coerceIn(75, 255)
                    }
                }

                for (y in 0 until targetH) {
                    val by = Math.min(y / blockSize, blocksY - 1)
                    val rowOff = y * targetW
                    for (x in 0 until targetW) {
                        val bx = Math.min(x / blockSize, blocksX - 1)
                        val localBg = bgMax[by * blocksX + bx].toFloat()
                        val p = wPixels[rowOff + x]
                        val r = (p shr 16) and 0xFF
                        val g = (p shr 8) and 0xFF
                        val b = p and 0xFF

                        val scale = 252f / localBg
                        val nr = (r * scale).toInt().coerceIn(0, 255)
                        val ng = (g * scale).toInt().coerceIn(0, 255)
                        val nb = (b * scale).toInt().coerceIn(0, 255)

                        fun boostText(ch: Int): Int {
                            return if (ch > 218) 255
                            else if (ch < 85) (ch * 0.70f).toInt()
                            else (((ch - 85).toFloat() / 133f) * 175f + 60f).toInt().coerceIn(0, 255)
                        }
                        wPixels[rowOff + x] = (0xFF shl 24) or (boostText(nr) shl 16) or (boostText(ng) shl 8) or boostText(nb)
                    }
                }
                val magicBm = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                magicBm.setPixels(wPixels, 0, targetW, 0, 0, targetW, targetH)
                warpedBm.recycle()
                magicBm
            }

            val cacheDir = File(context.cacheDir, "straightened_docs")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val outFile = File(cacheDir, "doc_${System.currentTimeMillis()}_${(0..9999).random()}.jpg")
            val fos = FileOutputStream(outFile)
            filteredBm.compress(Bitmap.CompressFormat.JPEG, 90, fos)
            fos.flush()
            fos.close()
            filteredBm.recycle()

            val cornersList: List<Map<String, Any>> = listOf(
                mapOf<String, Any>("x" to (tlX / origW), "y" to (tlY / origH)),
                mapOf<String, Any>("x" to (trX / origW), "y" to (trY / origH)),
                mapOf<String, Any>("x" to (brX / origW), "y" to (brY / origH)),
                mapOf<String, Any>("x" to (blX / origW), "y" to (blY / origH))
            )

            return@AsyncFunction mapOf<String, Any>(
                "uri" to ("file://" + outFile.absolutePath),
                "width" to targetW,
                "height" to targetH,
                "hasEdges" to true,
                "corners" to cornersList
            )
        }

        AsyncFunction("computeImageHashAndSharpness") { imageUri: String ->
            val context = appContext.reactContext ?: return@AsyncFunction mapOf("hash" to "", "sharpness" to 0.0)
            val bm = decodeDownsampledBitmap(context, imageUri, 128)
                ?: return@AsyncFunction mapOf("hash" to "", "sharpness" to 0.0)

            try {
                // 1. dHash (9x8 grayscale difference)
                val dHashBm = Bitmap.createScaledBitmap(bm, 9, 8, true)
                var dHash = 0L
                for (y in 0 until 8) {
                    for (x in 0 until 8) {
                        val leftP = dHashBm.getPixel(x, y)
                        val rightP = dHashBm.getPixel(x + 1, y)
                        val left = (Color.red(leftP) * 299 + Color.green(leftP) * 587 + Color.blue(leftP) * 114) / 1000
                        val right = (Color.red(rightP) * 299 + Color.green(rightP) * 587 + Color.blue(rightP) * 114) / 1000
                        if (left > right) {
                            dHash = dHash or (1L shl (y * 8 + x))
                        }
                    }
                }
                dHashBm.recycle()

                // 2. Laplacian Sharpness (on a 48x48 scaled grayscale)
                val sharpBm = Bitmap.createScaledBitmap(bm, 48, 48, true)
                val w = 48
                val h = 48
                val gray = IntArray(w * h)
                for (y in 0 until h) {
                    for (x in 0 until w) {
                        val p = sharpBm.getPixel(x, y)
                        gray[y * w + x] = (Color.red(p) * 299 + Color.green(p) * 587 + Color.blue(p) * 114) / 1000
                    }
                }
                sharpBm.recycle()

                var sum = 0.0
                var sumSq = 0.0
                var count = 0
                for (y in 1 until (h - 1)) {
                    val yOff = y * w
                    for (x in 1 until (w - 1)) {
                        val lap = gray[yOff - w + x] + gray[yOff + w + x] + gray[yOff + x - 1] + gray[yOff + x + 1] - 4 * gray[yOff + x]
                        sum += lap
                        sumSq += lap * lap
                        count++
                    }
                }
                val variance = if (count > 0) (sumSq / count) - ((sum / count) * (sum / count)) else 0.0

                bm.recycle()

                val hexHash = java.lang.Long.toHexString(dHash)
                return@AsyncFunction mapOf(
                    "hash" to hexHash,
                    "sharpness" to variance
                )
            } catch (e: Exception) {
                try { bm.recycle() } catch (_: Exception) {}
                return@AsyncFunction mapOf("hash" to "", "sharpness" to 0.0)
            }
        }

        AsyncFunction("getStorageStats") {
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            try {
                val statFs = StatFs(Environment.getDataDirectory().path)
                val totalBytes = statFs.totalBytes
                val availableBytes = statFs.availableBytes
                val appCacheBytes = getFolderSize(context.cacheDir)
                return@AsyncFunction mapOf(
                    "totalBytes" to totalBytes,
                    "availableBytes" to availableBytes,
                    "appCacheBytes" to appCacheBytes
                )
            } catch (e: Exception) {
                return@AsyncFunction mapOf(
                    "totalBytes" to 0L,
                    "availableBytes" to 0L,
                    "appCacheBytes" to 0L
                )
            }
        }

        AsyncFunction("batchDeleteFiles") { uris: List<String> ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            var deleted = 0
            var freedBytes: Long = 0
            var failed = 0

            for (uriStr in uris) {
                try {
                    if (uriStr.startsWith("content://")) {
                        val uri = Uri.parse(uriStr)
                        try {
                            val cr = context.contentResolver
                            var fileSize: Long = 0
                            cr.query(uri, arrayOf(MediaStore.MediaColumns.SIZE), null, null, null)?.use { cursor ->
                                if (cursor.moveToFirst()) {
                                    fileSize = cursor.getLong(0)
                                }
                            }
                            val rows = cr.delete(uri, null, null)
                            if (rows > 0) {
                                deleted++
                                freedBytes += fileSize
                            } else {
                                failed++
                            }
                        } catch (e: Exception) {
                            failed++
                        }
                    } else {
                        val cleanPath = if (uriStr.startsWith("file://")) Uri.parse(uriStr).path ?: uriStr.substring(7) else uriStr
                        val file = File(cleanPath)
                        if (file.exists()) {
                            val len = file.length()
                            if (file.delete()) {
                                deleted++
                                freedBytes += len
                            } else {
                                failed++
                            }
                        } else {
                            failed++
                        }
                    }
                } catch (e: Exception) {
                    failed++
                }
            }
            return@AsyncFunction mapOf(
                "deleted" to deleted,
                "freedBytes" to freedBytes,
                "failed" to failed
            )
        }

        AsyncFunction("rotatePdfPages") { pdfUri: String, rotations: Map<String, Int>, outPath: String?, mode: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val inputFile = resolvePdfFile(context, pdfUri)
            val outFile = if (!outPath.isNullOrBlank()) resolveOutputFile(context, outPath) else inputFile
            val tempOut = File(outFile.parentFile, "tmp_rot_${System.currentTimeMillis()}.pdf")

            val doc = PDDocument.load(inputFile)
            try {
                val total = doc.numberOfPages
                for ((idxStr, deg) in rotations) {
                    val idx = idxStr.toIntOrNull() ?: continue
                    if (idx in 0 until total) {
                        val page = doc.getPage(idx)
                        if (mode == "absolute") {
                            page.rotation = ((deg % 360) + 360) % 360
                        } else {
                            page.rotation = (((page.rotation + deg) % 360) + 360) % 360
                        }
                    }
                }
                doc.save(tempOut)
            } finally {
                try { doc.close() } catch (_: Exception) {}
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("replacePdfPages") { pdfUri: String, replacements: List<Map<String, Any>>, outPath: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val inputFile = resolvePdfFile(context, pdfUri)
            val outFile = if (!outPath.isNullOrBlank()) resolveOutputFile(context, outPath) else inputFile
            val tempOut = File(outFile.parentFile, "tmp_rep_${System.currentTimeMillis()}.pdf")

            val repMap = mutableMapOf<Int, Map<String, Any>>()
            for (item in replacements) {
                val idx = (item["pageIndex"] as? Number)?.toInt() ?: continue
                repMap[idx] = item
            }

            val targetDoc = PDDocument.load(inputFile)
            val newDoc = PDDocument()
            try {
                val total = targetDoc.numberOfPages
                for (i in 0 until total) {
                    val rep = repMap[i]
                    if (rep != null) {
                        val imgUri = rep["imageUri"] as? String
                        if (!imgUri.isNullOrBlank()) {
                            val imgFile = resolveImageFile(context, imgUri)
                            val pdImage = try {
                                FileInputStream(imgFile).use { fis ->
                                    JPEGFactory.createFromStream(newDoc, fis)
                                }
                            } catch (_: Throwable) {
                                val bmp = BitmapFactory.decodeFile(imgFile.absolutePath)
                                    ?: throw Exception("Failed to decode image: $imgUri")
                                try {
                                    JPEGFactory.createFromImage(newDoc, bmp)
                                } finally {
                                    try { bmp.recycle() } catch (_: Throwable) {}
                                }
                            }
                            val page = PDPage(PDRectangle(pdImage.width.toFloat(), pdImage.height.toFloat()))
                            val rot = (rep["rotation"] as? Number)?.toInt() ?: 0
                            if (rot != 0) {
                                page.rotation = ((rot % 360) + 360) % 360
                            }
                            val cs = PDPageContentStream(newDoc, page)
                            try {
                                cs.drawImage(pdImage, 0f, 0f, pdImage.width.toFloat(), pdImage.height.toFloat())
                            } finally {
                                try { cs.close() } catch (_: Throwable) {}
                            }
                            newDoc.addPage(page)
                        } else {
                            val p = targetDoc.getPage(i)
                            val rot = (rep["rotation"] as? Number)?.toInt()
                            if (rot != null) {
                                p.rotation = ((rot % 360) + 360) % 360
                            }
                            newDoc.addPage(p)
                        }
                    } else {
                        newDoc.addPage(targetDoc.getPage(i))
                    }
                }
                newDoc.save(tempOut)
            } finally {
                try { newDoc.close() } catch (_: Exception) {}
                try { targetDoc.close() } catch (_: Exception) {}
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("deletePdfPages") { pdfUri: String, pageIndices: List<Int>, outPath: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val inputFile = resolvePdfFile(context, pdfUri)
            val outFile = if (!outPath.isNullOrBlank()) resolveOutputFile(context, outPath) else inputFile
            val tempOut = File(outFile.parentFile, "tmp_del_${System.currentTimeMillis()}.pdf")

            val doc = PDDocument.load(inputFile)
            try {
                val sortedDesc = pageIndices.distinct().sortedDescending()
                for (idx in sortedDesc) {
                    if (idx in 0 until doc.numberOfPages) {
                        doc.removePage(idx)
                    }
                }
                if (doc.numberOfPages == 0) {
                    throw Exception("Cannot delete all pages from PDF")
                }
                doc.save(tempOut)
            } finally {
                try { doc.close() } catch (_: Exception) {}
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("reorderPdfPages") { pdfUri: String, newPageOrder: List<Int>, outPath: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val inputFile = resolvePdfFile(context, pdfUri)
            val outFile = if (!outPath.isNullOrBlank()) resolveOutputFile(context, outPath) else inputFile
            val tempOut = File(outFile.parentFile, "tmp_ord_${System.currentTimeMillis()}.pdf")

            val doc = PDDocument.load(inputFile)
            val newDoc = PDDocument()
            try {
                val total = doc.numberOfPages
                for (idx in newPageOrder) {
                    if (idx in 0 until total) {
                        newDoc.addPage(doc.getPage(idx))
                    }
                }
                newDoc.save(tempOut)
            } finally {
                try { newDoc.close() } catch (_: Exception) {}
                try { doc.close() } catch (_: Exception) {}
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("extractPdfPages") { pdfUri: String, pageIndices: List<Int>, outPath: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val inputFile = resolvePdfFile(context, pdfUri)
            val outFile = resolveOutputFile(context, outPath)
            val tempOut = File(outFile.parentFile, "tmp_ext_${System.currentTimeMillis()}.pdf")

            val doc = PDDocument.load(inputFile)
            val newDoc = PDDocument()
            try {
                val total = doc.numberOfPages
                for (idx in pageIndices.sorted()) {
                    if (idx in 0 until total) {
                        newDoc.addPage(doc.getPage(idx))
                    }
                }
                newDoc.save(tempOut)
            } finally {
                try { newDoc.close() } catch (_: Exception) {}
                try { doc.close() } catch (_: Exception) {}
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("mergePdfFiles") { pdfUris: List<String>, outPath: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val outFile = resolveOutputFile(context, outPath)
            val tempOut = File(outFile.parentFile, "tmp_mrg_${System.currentTimeMillis()}.pdf")

            val merger = PDFMergerUtility()
            merger.destinationFileName = tempOut.absolutePath
            val openedDocs = mutableListOf<PDDocument>()
            try {
                for (u in pdfUris) {
                    val f = resolvePdfFile(context, u)
                    val d = PDDocument.load(f)
                    openedDocs.add(d)
                    merger.addSource(f)
                }
                merger.mergeDocuments(MemoryUsageSetting.setupMainMemoryOnly())
            } finally {
                for (d in openedDocs) {
                    try { d.close() } catch (_: Exception) {}
                }
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("insertPdfPages") { targetPdfUri: String, insertPdfUri: String, atIndex: Int, outPath: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val targetFile = resolvePdfFile(context, targetPdfUri)
            val insertFile = resolvePdfFile(context, insertPdfUri)
            val outFile = if (!outPath.isNullOrBlank()) resolveOutputFile(context, outPath) else targetFile
            val tempOut = File(outFile.parentFile, "tmp_ins_${System.currentTimeMillis()}.pdf")

            val targetDoc = PDDocument.load(targetFile)
            val insertDoc = PDDocument.load(insertFile)
            val newDoc = PDDocument()
            try {
                val totalTarget = targetDoc.numberOfPages
                val insertPos = Math.max(0, Math.min(atIndex, totalTarget))
                for (i in 0 until insertPos) {
                    newDoc.addPage(targetDoc.getPage(i))
                }
                for (i in 0 until insertDoc.numberOfPages) {
                    newDoc.addPage(insertDoc.getPage(i))
                }
                for (i in insertPos until totalTarget) {
                    newDoc.addPage(targetDoc.getPage(i))
                }
                newDoc.save(tempOut)
            } finally {
                try { newDoc.close() } catch (_: Exception) {}
                try { insertDoc.close() } catch (_: Exception) {}
                try { targetDoc.close() } catch (_: Exception) {}
            }

            if (tempOut.exists()) {
                if (outFile.exists()) outFile.delete()
                tempOut.renameTo(outFile)
            }
            "file://" + outFile.absolutePath
        }

        AsyncFunction("splitPdf") { pdfUri: String, splitBoundaries: List<Int>, baseName: String ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            ensurePdfBox(context)

            val inputFile = resolvePdfFile(context, pdfUri)
            val doc = PDDocument.load(inputFile)
            val results = mutableListOf<String>()
            try {
                val totalPages = doc.numberOfPages
                val boundaries = (listOf(0) + splitBoundaries + listOf(totalPages)).distinct().sorted()
                val scansDir = File(context.filesDir, "scans")
                if (!scansDir.exists()) scansDir.mkdirs()

                for (i in 0 until boundaries.size - 1) {
                    val start = boundaries[i]
                    val end = boundaries[i + 1]
                    if (start >= end) continue

                    val partDoc = PDDocument()
                    for (p in start until end) {
                        if (p in 0 until totalPages) {
                            partDoc.addPage(doc.getPage(p))
                        }
                    }
                    val partFile = File(scansDir, "${baseName}_Part${i + 1}_p${start + 1}-${end}.pdf")
                    partDoc.save(partFile)
                    partDoc.close()
                    results.add("file://" + partFile.absolutePath)
                }
            } finally {
                try { doc.close() } catch (_: Exception) {}
            }
            results
        }

        AsyncFunction("getExternalStorageVolumes") {
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val results = mutableListOf<Map<String, Any>>()

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    val sm = context.getSystemService(Context.STORAGE_SERVICE) as? StorageManager
                    val volumes = sm?.storageVolumes
                    if (volumes != null) {
                        for (vol in volumes) {
                            val isPrimary = vol.isPrimary
                            val isRemovable = vol.isRemovable
                            val desc = vol.getDescription(context) ?: if (isPrimary) "Internal Storage" else "SD Card"
                            val state = vol.state
                            var path: String? = null

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                path = vol.directory?.absolutePath
                            }

                            if (path == null) {
                                if (isPrimary) {
                                    path = Environment.getExternalStorageDirectory().absolutePath
                                } else {
                                    val dirs = context.getExternalFilesDirs(null)
                                    for (d in dirs) {
                                        if (d != null && !d.absolutePath.startsWith(Environment.getExternalStorageDirectory().absolutePath)) {
                                            val p = d.absolutePath
                                            val idx = p.indexOf("/Android/data")
                                            if (idx != -1) {
                                                path = p.substring(0, idx)
                                                break
                                            }
                                        }
                                    }
                                }
                            }

                            var totalBytes: Long = 0
                            var freeBytes: Long = 0
                            if (path != null && File(path).exists()) {
                                try {
                                    val stat = StatFs(path)
                                    totalBytes = stat.totalBytes
                                    freeBytes = stat.availableBytes
                                } catch (_: Exception) {}
                            }

                            results.add(mapOf(
                                "description" to desc,
                                "path" to (path ?: ""),
                                "isPrimary" to isPrimary,
                                "isRemovable" to isRemovable,
                                "state" to state,
                                "totalBytes" to totalBytes,
                                "freeBytes" to freeBytes
                            ))
                        }
                    }
                }
            } catch (_: Exception) {}

            if (results.isEmpty()) {
                val primaryPath = Environment.getExternalStorageDirectory().absolutePath
                var totalBytes: Long = 0
                var freeBytes: Long = 0
                try {
                    val stat = StatFs(primaryPath)
                    totalBytes = stat.totalBytes
                    freeBytes = stat.availableBytes
                } catch (_: Exception) {}
                results.add(mapOf(
                    "description" to "Internal Storage",
                    "path" to primaryPath,
                    "isPrimary" to true,
                    "isRemovable" to false,
                    "state" to "mounted",
                    "totalBytes" to totalBytes,
                    "freeBytes" to freeBytes
                ))
            }

            results
        }

        AsyncFunction("openFileInNativeViewer") { fileUri: String, mimeType: String, fileNameArg: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val activity = appContext.currentActivity ?: throw Exception("Activity not found")

            try {
                var contentUri: Uri? = null

                if (fileUri.startsWith("content://")) {
                    contentUri = Uri.parse(fileUri)
                } else {
                    val cleanPath = when {
                        fileUri.startsWith("file://") -> Uri.parse(fileUri).path ?: fileUri.substring(7)
                        else -> fileUri
                    }
                    val decodedPath = Uri.decode(cleanPath)
                    val srcFile = File(decodedPath).takeIf { it.exists() } ?: File(cleanPath)

                    if (srcFile.exists()) {
                        val cacheDir = File(context.cacheDir, "open_cache")
                        if (!cacheDir.exists()) cacheDir.mkdirs()

                        val resolvedName = (fileNameArg ?: srcFile.name).replace(Regex("[^a-zA-Z0-9._-]"), "_")
                        val cachedFile = File(cacheDir, resolvedName)

                        if (srcFile.absolutePath != cachedFile.absolutePath) {
                            srcFile.copyTo(cachedFile, overwrite = true)
                        }

                        val authority = context.packageName + ".FileSystemFileProvider"
                        contentUri = FileProvider.getUriForFile(context, authority, cachedFile)
                    } else {
                        contentUri = Uri.parse(fileUri)
                    }
                }

                val finalMime = if (mimeType.isBlank() || mimeType == "*/*") {
                    val ext = MimeTypeMap.getFileExtensionFromUrl(fileUri).lowercase(Locale.US)
                    MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
                } else {
                    mimeType
                }

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUri, finalMime)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }

                activity.startActivity(intent)
                mapOf("success" to true)
            } catch (e: Exception) {
                mapOf("success" to false, "error" to (e.localizedMessage ?: e.message ?: "Failed to open file"))
            }
        }

        Function("hasAllFilesPermission") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Environment.isExternalStorageManager()
            } else {
                true
            }
        }

        AsyncFunction("startLanServer") { fileList: List<Map<String, Any>>, portArg: Int? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val targetPort = portArg ?: 8088

            val sharedList = fileList.mapIndexed { idx, map ->
                LanHttpServer.SharedFile(
                    id = (map["id"] as? String) ?: idx.toString(),
                    name = (map["name"] as? String) ?: "File_$idx",
                    uri = (map["uri"] as? String) ?: "",
                    size = (map["size"] as? Number)?.toLong() ?: 0L,
                    mimeType = (map["mimeType"] as? String) ?: "*/*"
                )
            }

            var server = lanHttpServer
            if (server == null) {
                server = LanHttpServer(context, targetPort)
                lanHttpServer = server
            }

            server.setFiles(sharedList)
            val activePort = server.start()
            val ip = getLocalWifiIp(context) ?: "127.0.0.1"
            val serverUrl = "http://$ip:$activePort"

            mapOf(
                "isRunning" to true,
                "serverUrl" to serverUrl,
                "ip" to ip,
                "port" to activePort,
                "fileCount" to sharedList.size
            )
        }

        AsyncFunction("stopLanServer") {
            lanHttpServer?.stop()
            lanHttpServer = null
            true
        }

        AsyncFunction("getLanServerStatus") {
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val server = lanHttpServer
            val isRunning = server?.isServerRunning() == true
            val port = server?.getPort() ?: 8088
            val ip = getLocalWifiIp(context) ?: "127.0.0.1"
            val fileCount = server?.getFileCount() ?: 0

            mapOf(
                "isRunning" to isRunning,
                "serverUrl" to if (isRunning) "http://$ip:$port" else "",
                "ip" to ip,
                "port" to port,
                "fileCount" to fileCount
            )
        }

        AsyncFunction("getDeviceWifiIp") {
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            getLocalWifiIp(context)
        }

        AsyncFunction("startFtpServer") { portArg: Int?, rootPathArg: String? ->
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val targetPort = portArg ?: 2121

            val rootDir = if (!rootPathArg.isNullOrBlank()) {
                val clean = if (rootPathArg.startsWith("file://")) Uri.parse(rootPathArg).path ?: rootPathArg.substring(7) else rootPathArg
                File(clean).takeIf { it.exists() && it.isDirectory } ?: Environment.getExternalStorageDirectory()
            } else {
                Environment.getExternalStorageDirectory()
            }

            var server = lanFtpServer
            if (server == null) {
                server = LanFtpServer(context, targetPort, rootDir)
                lanFtpServer = server
            } else {
                server.setRootDir(rootDir)
            }

            val activePort = server.start()
            val ip = getLocalWifiIp(context) ?: "127.0.0.1"
            val ftpUrl = "ftp://$ip:$activePort"

            mapOf(
                "isRunning" to true,
                "ftpUrl" to ftpUrl,
                "ip" to ip,
                "port" to activePort,
                "rootPath" to rootDir.absolutePath
            )
        }

        AsyncFunction("stopFtpServer") {
            lanFtpServer?.stop()
            lanFtpServer = null
            true
        }

        AsyncFunction("getFtpServerStatus") {
            val context = appContext.reactContext ?: throw Exception("React Context not found")
            val server = lanFtpServer
            val isRunning = server?.isServerRunning() == true
            val port = server?.getPort() ?: 2121
            val ip = getLocalWifiIp(context) ?: "127.0.0.1"
            val connCount = server?.getActiveConnections() ?: 0

            mapOf(
                "isRunning" to isRunning,
                "ftpUrl" to if (isRunning) "ftp://$ip:$port" else "",
                "ip" to ip,
                "port" to port,
                "activeConnections" to connCount
            )
        }
    }

    private fun ensurePdfBox(context: Context) {
        try {
            PDFBoxResourceLoader.init(context)
        } catch (_: Exception) {}
    }

    private fun resolvePdfFile(context: Context, uriString: String): File {
        if (uriString.startsWith("content://")) {
            val cacheDir = File(context.cacheDir, "temp_pdf_in")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val temp = File(cacheDir, "input_${System.currentTimeMillis()}.pdf")
            context.contentResolver.openInputStream(Uri.parse(uriString))?.use { input ->
                FileOutputStream(temp).use { output ->
                    input.copyTo(output)
                }
            }
            return temp
        }
        val cleanPath = when {
            uriString.startsWith("file://") -> {
                val rawPath = Uri.parse(uriString).path ?: uriString.substring(7)
                val decoded = Uri.decode(rawPath)
                if (File(decoded).exists()) decoded else rawPath
            }
            else -> {
                val decoded = Uri.decode(uriString)
                if (File(decoded).exists()) decoded else uriString
            }
        }
        val f = File(cleanPath)
        if (!f.exists()) throw Exception("PDF file not found: $uriString")
        return f
    }

    private fun resolveImageFile(context: Context, uriString: String): File {
        if (uriString.startsWith("content://")) {
            val cacheDir = File(context.cacheDir, "temp_img_in")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val temp = File(cacheDir, "img_${System.currentTimeMillis()}_${(0..9999).random()}.jpg")
            context.contentResolver.openInputStream(Uri.parse(uriString))?.use { input ->
                FileOutputStream(temp).use { output ->
                    input.copyTo(output)
                }
            }
            return temp
        }
        val cleanPath = when {
            uriString.startsWith("file://") -> {
                val rawPath = Uri.parse(uriString).path ?: uriString.substring(7)
                val decoded = Uri.decode(rawPath)
                if (File(decoded).exists()) decoded else rawPath
            }
            else -> {
                val decoded = Uri.decode(uriString)
                if (File(decoded).exists()) decoded else uriString
            }
        }
        val f = File(cleanPath)
        if (!f.exists()) throw Exception("Image file not found: $uriString")
        return f
    }

    private fun resolveOutputFile(context: Context, uriOrName: String): File {
        if (uriOrName.startsWith("file://") || uriOrName.startsWith("/")) {
            val cleanPath = if (uriOrName.startsWith("file://")) Uri.parse(uriOrName).path ?: uriOrName.substring(7) else uriOrName
            val f = File(Uri.decode(cleanPath))
            f.parentFile?.mkdirs()
            return f
        }
        val scansDir = File(context.filesDir, "scans")
        if (!scansDir.exists()) scansDir.mkdirs()
        val safeName = uriOrName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val cleanName = if (safeName.endsWith(".pdf", ignoreCase = true)) safeName else "$safeName.pdf"
        return File(scansDir, cleanName)
    }

    private fun getFolderSize(dir: File): Long {
        var size: Long = 0
        if (dir.exists()) {
            val files = dir.listFiles()
            if (files != null) {
                for (f in files) {
                    size += if (f.isDirectory) getFolderSize(f) else f.length()
                }
            }
        }
        return size
    }

    private fun openPfd(context: Context, pdfUri: String): ParcelFileDescriptor {
        return when {
            pdfUri.startsWith("content://") -> {
                val parsedUri = Uri.parse(pdfUri)
                context.contentResolver.openFileDescriptor(parsedUri, "r")
                    ?: throw Exception("Cannot open content URI: $pdfUri")
            }
            pdfUri.startsWith("file://") -> {
                val rawPath = Uri.parse(pdfUri).path ?: pdfUri.substring(7)
                val decodedPath = Uri.decode(rawPath)
                val file = File(decodedPath)
                if (file.exists()) {
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                } else {
                    val rawFile = File(rawPath)
                    if (rawFile.exists()) {
                        ParcelFileDescriptor.open(rawFile, ParcelFileDescriptor.MODE_READ_ONLY)
                    } else {
                        throw Exception("File not found: $decodedPath")
                    }
                }
            }
            else -> {
                val decoded = Uri.decode(pdfUri)
                val file = File(decoded)
                if (file.exists()) {
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                } else {
                    val rawFile = File(pdfUri)
                    if (rawFile.exists()) {
                        ParcelFileDescriptor.open(rawFile, ParcelFileDescriptor.MODE_READ_ONLY)
                    } else {
                        throw Exception("File not found: $pdfUri")
                    }
                }
            }
        }
    }

    private fun decodeDownsampledBitmap(context: Context, uriString: String, maxDim: Int = 128): Bitmap? {
        return try {
            val cleanPath = when {
                uriString.startsWith("file://") -> Uri.parse(uriString).path ?: uriString.substring(7)
                else -> uriString
            }
            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            if (uriString.startsWith("content://")) {
                val uri = Uri.parse(uriString)
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    BitmapFactory.decodeStream(stream, null, options)
                }
            } else {
                val f = File(cleanPath)
                if (f.exists()) {
                    BitmapFactory.decodeFile(f.absolutePath, options)
                } else {
                    val uri = Uri.parse(uriString)
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        BitmapFactory.decodeStream(stream, null, options)
                    }
                }
            }

            val origW = options.outWidth
            val origH = options.outHeight
            if (origW <= 0 || origH <= 0) return null

            var sampleSize = 1
            while ((origW / sampleSize) > maxDim * 2 || (origH / sampleSize) > maxDim * 2) {
                sampleSize *= 2
            }

            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
                inDither = false
            }

            if (uriString.startsWith("content://")) {
                val uri = Uri.parse(uriString)
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    BitmapFactory.decodeStream(stream, null, decodeOpts)
                }
            } else {
                val f = File(cleanPath)
                if (f.exists()) {
                    BitmapFactory.decodeFile(f.absolutePath, decodeOpts)
                } else {
                    val uri = Uri.parse(uriString)
                    context.contentResolver.openInputStream(uri)?.use { stream ->
                        BitmapFactory.decodeStream(stream, null, decodeOpts)
                    }
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun decodeBitmapFromUriOrPath(context: Context, uriString: String): Bitmap? {
        return try {
            var exifRot = 0
            val cleanPath = when {
                uriString.startsWith("file://") -> Uri.parse(uriString).path ?: uriString.substring(7)
                else -> uriString
            }
            if (!uriString.startsWith("data:") && !uriString.startsWith("content://")) {
                try {
                    val exif = android.media.ExifInterface(cleanPath)
                    val orientation = exif.getAttributeInt(
                        android.media.ExifInterface.TAG_ORIENTATION,
                        android.media.ExifInterface.ORIENTATION_NORMAL
                    )
                    exifRot = when (orientation) {
                        android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                        android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                        android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                        else -> 0
                    }
                } catch (_: Exception) {}
            }

            val rawBm = when {
                uriString.startsWith("data:") -> {
                    val commaIndex = uriString.indexOf(",")
                    val base64Data = if (commaIndex != -1) uriString.substring(commaIndex + 1) else uriString
                    val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                }
                uriString.startsWith("content://") -> {
                    val uri = Uri.parse(uriString)
                    try {
                        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        context.contentResolver.openInputStream(uri)?.use { stream ->
                            BitmapFactory.decodeStream(stream, null, boundsOptions)
                        }
                        if (boundsOptions.outWidth > 0 && boundsOptions.outHeight > 0) {
                            val decodeOptions = BitmapFactory.Options().apply {
                                inSampleSize = calculateInSampleSize(boundsOptions, 1600, 1600)
                                inJustDecodeBounds = false
                            }
                            context.contentResolver.openInputStream(uri)?.use { stream ->
                                BitmapFactory.decodeStream(stream, null, decodeOptions)
                            }
                        } else {
                            context.contentResolver.openInputStream(uri)?.use { stream ->
                                BitmapFactory.decodeStream(stream)
                            }
                        }
                    } catch (_: Exception) {
                        context.contentResolver.openInputStream(uri)?.use { stream ->
                            BitmapFactory.decodeStream(stream)
                        }
                    }
                }
                uriString.startsWith("file://") -> {
                    decodeSampledBitmapFromFile(cleanPath, 1600) ?: BitmapFactory.decodeFile(cleanPath)
                }
                else -> {
                    val file = File(uriString)
                    if (file.exists()) {
                        decodeSampledBitmapFromFile(file.absolutePath, 1600) ?: BitmapFactory.decodeFile(file.absolutePath)
                    } else {
                        val uri = Uri.parse(uriString)
                        try {
                            val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            context.contentResolver.openInputStream(uri)?.use { stream ->
                                BitmapFactory.decodeStream(stream, null, boundsOptions)
                            }
                            if (boundsOptions.outWidth > 0 && boundsOptions.outHeight > 0) {
                                val decodeOptions = BitmapFactory.Options().apply {
                                    inSampleSize = calculateInSampleSize(boundsOptions, 1600, 1600)
                                    inJustDecodeBounds = false
                                }
                                context.contentResolver.openInputStream(uri)?.use { stream ->
                                    BitmapFactory.decodeStream(stream, null, decodeOptions)
                                }
                            } else {
                                context.contentResolver.openInputStream(uri)?.use { stream ->
                                    BitmapFactory.decodeStream(stream)
                                }
                            }
                        } catch (_: Exception) {
                            context.contentResolver.openInputStream(uri)?.use { stream ->
                                BitmapFactory.decodeStream(stream)
                            }
                        }
                    }
                }
            } ?: return null

            if (exifRot != 0) {
                val m = Matrix().apply { postRotate(exifRot.toFloat()) }
                val rotated = Bitmap.createBitmap(rawBm, 0, 0, rawBm.width, rawBm.height, m, true)
                if (rotated != rawBm) rawBm.recycle()
                rotated
            } else {
                rawBm
            }
        } catch (e: Exception) {
            null
        }
    }
}

