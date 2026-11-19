package com.filelenspro.app.service

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import android.webkit.MimeTypeMap
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.CleanerCategory
import com.filelenspro.app.data.model.CleanerFileItem
import com.filelenspro.app.data.model.DuplicateFileItem
import com.filelenspro.app.data.model.DuplicateGroup
import com.filelenspro.app.data.model.JunkCacheStats
import com.filelenspro.app.data.model.PdfCompressCandidate
import com.filelenspro.app.data.model.PdfCompressPreset
import com.filelenspro.app.data.model.PhotoCompressCandidate
import com.filelenspro.app.data.model.PhotoCompressPreset
import com.filelenspro.app.data.model.SimilarImageItem
import com.filelenspro.app.data.model.StorageAnalysis
import com.filelenspro.app.data.model.StorageCategoryStat
import com.filelenspro.app.data.model.StorageItem
import com.filelenspro.app.data.model.VisualCluster
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale
import kotlin.math.abs

class StorageAnalyzer(
    private val context: Context,
    private val engine: OcrAndPdfEngine
) {
    fun getAppRootFolders(): List<StorageItem> {
        val result = mutableListOf<StorageItem>()
        if (com.filelenspro.app.util.StoragePermissionHelper.hasAllFilesAccess(context)) {
            val deviceRoots = listOf(
                "Internal Storage (Device)" to Environment.getExternalStorageDirectory(),
                "Downloads" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "Documents" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
                "DCIM / Camera" to Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM)
            )
            deviceRoots.forEach { (label, dir) ->
                if (dir != null && dir.exists() && dir.canRead()) {
                    result.add(
                        StorageItem(
                            id = "device_${dir.absolutePath}",
                            name = label,
                            path = dir.absolutePath,
                            isDirectory = true,
                            size = 0L,
                            modifiedMs = dir.lastModified(),
                            extension = "",
                            mimeType = "inode/directory"
                        )
                    )
                }
            }
        }
        val vaultDirs = listOf(
            "ScannedDocs" to File(context.filesDir, "ScannedDocs").apply { mkdirs() },
            "IndexedDocs" to File(context.filesDir, "IndexedDocs").apply { mkdirs() },
            "SmartCards" to File(context.filesDir, "SmartCards").apply { mkdirs() },
            "Exports" to File(context.filesDir, "Exports").apply { mkdirs() }
        )
        vaultDirs.forEach { (label, dir) ->
            result.add(
                StorageItem(
                    id = dir.absolutePath,
                    name = label,
                    path = dir.absolutePath,
                    isDirectory = true,
                    size = dir.walkTopDown().filter { it.isFile }.sumOf { it.length() },
                    modifiedMs = dir.lastModified(),
                    extension = "",
                    mimeType = "inode/directory"
                )
            )
        }
        return result
    }

    fun listDirectory(dirPath: String): List<StorageItem> {
        val dir = File(dirPath)
        if (!dir.exists() || !dir.isDirectory) return emptyList()
        return (dir.listFiles() ?: emptyArray())
            .filter { !it.name.startsWith(".") }
            .map { f ->
                val ext = f.extension.lowercase(Locale.ROOT)
                val mime = if (f.isDirectory) "inode/directory"
                else MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
                StorageItem(
                    id = f.absolutePath,
                    name = f.name,
                    path = f.absolutePath,
                    isDirectory = f.isDirectory,
                    size = if (f.isDirectory) 0L else f.length(),
                    modifiedMs = f.lastModified(),
                    extension = ext,
                    mimeType = mime
                )
            }
            .sortedWith(compareByDescending<StorageItem> { it.isDirectory }.thenBy { it.name.lowercase(Locale.ROOT) })
    }

    suspend fun analyzeStorage(indexedFiles: List<FileEntity>): StorageAnalysis = withContext(Dispatchers.IO) {
        val stat = StatFs(Environment.getDataDirectory().path)
        val total = stat.totalBytes
        val free = stat.availableBytes
        val used = (total - free).coerceAtLeast(0L)

        val pdfBytes = indexedFiles.filter { it.extension.equals("pdf", true) }.sumOf { it.size }
        val imgBytes = indexedFiles.filter { it.extension.lowercase(Locale.ROOT) in setOf("jpg", "jpeg", "png", "webp") }.sumOf { it.size }
        val docBytes = indexedFiles.filter { it.extension.lowercase(Locale.ROOT) in setOf("txt", "doc", "docx", "xlsx", "csv") }.sumOf { it.size }
        val otherBytes = (indexedFiles.sumOf { it.size } - pdfBytes - imgBytes - docBytes).coerceAtLeast(0L)

        val categories = listOf(
            StorageCategoryStat("PDF Documents", pdfBytes, indexedFiles.count { it.extension.equals("pdf", true) }),
            StorageCategoryStat("Images & Scans", imgBytes, indexedFiles.count { it.extension.lowercase(Locale.ROOT) in setOf("jpg", "jpeg", "png", "webp") }),
            StorageCategoryStat("Office & Text", docBytes, indexedFiles.count { it.extension.lowercase(Locale.ROOT) in setOf("txt", "doc", "docx", "xlsx", "csv") }),
            StorageCategoryStat("Other Files", otherBytes, indexedFiles.count { it.extension.lowercase(Locale.ROOT) !in setOf("pdf", "jpg", "jpeg", "png", "webp", "txt", "doc", "docx", "xlsx", "csv") })
        )

        val largeFiles = indexedFiles.filter { it.size >= 1_000_000L }.sortedByDescending { it.size }.take(30)

        StorageAnalysis(
            totalDeviceBytes = total,
            freeDeviceBytes = free,
            usedDeviceBytes = used,
            appIndexedBytes = indexedFiles.sumOf { it.size },
            categories = categories,
            largeFiles = largeFiles
        )
    }

    suspend fun getJunkCacheStats(): JunkCacheStats = withContext(Dispatchers.IO) {
        val pdfCacheDir = File(context.cacheDir, "pdf_images")
        val thumbCacheDir = File(context.cacheDir, "pdf_thumbs")
        val tempCrops = context.cacheDir.listFiles()?.filter { it.name.startsWith("rot_") || it.name.startsWith("del_") || it.name.startsWith("crop_") } ?: emptyList()

        val pdfBytes = dirSize(pdfCacheDir) + dirSize(thumbCacheDir)
        val cropBytes = tempCrops.sumOf { it.length() }
        val exportBytes = dirSize(File(context.cacheDir, "exports"))
        val count = countFiles(pdfCacheDir) + countFiles(thumbCacheDir) + tempCrops.size

        JunkCacheStats(
            pdfCacheBytes = pdfBytes,
            tempCropBytes = cropBytes,
            exportTempBytes = exportBytes,
            totalJunkBytes = pdfBytes + cropBytes + exportBytes,
            fileCount = count
        )
    }

    suspend fun cleanJunkCache(): Long = withContext(Dispatchers.IO) {
        val stats = getJunkCacheStats()
        File(context.cacheDir, "pdf_images").deleteRecursively()
        File(context.cacheDir, "pdf_thumbs").deleteRecursively()
        File(context.cacheDir, "exports").deleteRecursively()
        context.cacheDir.listFiles()?.forEach {
            if (it.isFile && (it.name.startsWith("rot_") || it.name.startsWith("del_") || it.name.startsWith("crop_"))) {
                it.delete()
            }
        }
        stats.totalJunkBytes
    }

    suspend fun findExactDuplicates(files: List<FileEntity>): List<DuplicateGroup> = withContext(Dispatchers.IO) {
        files.filter { it.sha256.isNotBlank() && it.size > 0 }
            .groupBy { it.sha256 }
            .filter { it.value.size > 1 }
            .map { (hash, group) ->
                val sorted = group.sortedBy { it.indexDate }
                DuplicateGroup(
                    hash = hash,
                    size = sorted.first().size,
                    files = sorted.mapIndexed { idx, f ->
                        DuplicateFileItem(
                            id = f.id,
                            uri = f.uri,
                            name = f.name,
                            size = f.size,
                            modified = f.modified,
                            isOriginal = idx == 0,
                            selectedForDeletion = idx > 0
                        )
                    }
                )
            }
            .sortedByDescending { it.size * (it.files.size - 1) }
    }

    suspend fun findSimilarImages(files: List<FileEntity>, maxHammingDist: Int = 8): List<VisualCluster> =
        withContext(Dispatchers.IO) {
            val images = files.filter { it.extension.lowercase(Locale.ROOT) in setOf("jpg", "jpeg", "png", "webp") }.take(80)
            val computed = images.mapNotNull { f ->
                val bmp = engine.decodeSampledBitmap(f.uri, 160) ?: return@mapNotNull null
                val dHash = computeDHash(bmp)
                val sharpness = computeSharpness(bmp)
                bmp.recycle()
                Triple(f, dHash, sharpness)
            }

            val visited = mutableSetOf<Long>()
            val clusters = mutableListOf<VisualCluster>()
            for (i in computed.indices) {
                val (fA, hashA, sharpA) = computed[i]
                if (fA.id in visited) continue
                val members = mutableListOf(Triple(fA, hashA, sharpA))
                for (j in i + 1 until computed.size) {
                    val (fB, hashB, sharpB) = computed[j]
                    if (fB.id in visited) continue
                    if (hammingDistance(hashA, hashB) <= maxHammingDist) {
                        members.add(Triple(fB, hashB, sharpB))
                        visited.add(fB.id)
                    }
                }
                if (members.size > 1) {
                    visited.add(fA.id)
                    val bestId = members.maxByOrNull { it.third }?.first?.id
                    clusters.add(
                        VisualCluster(
                            clusterId = "vis_${fA.id}",
                            items = members.map { (f, h, s) ->
                                val isBest = f.id == bestId
                                SimilarImageItem(
                                    id = f.id,
                                    uri = f.uri,
                                    name = f.name,
                                    size = f.size,
                                    sharpness = s,
                                    dHash = h,
                                    isBestShot = isBest,
                                    selectedForDeletion = !isBest
                                )
                            }
                        )
                    )
                }
            }
            clusters
        }

    suspend fun findCompressiblePhotos(
        files: List<FileEntity>,
        preset: PhotoCompressPreset = PhotoCompressPreset.LOSSLESS_LOOK,
        minSizeBytes: Long = 150_000L
    ): List<PhotoCompressCandidate> = withContext(Dispatchers.IO) {
        val imageExts = setOf("jpg", "jpeg", "png", "webp")
        files.filter { f ->
            f.extension.lowercase(Locale.ROOT) in imageExts && f.size >= minSizeBytes
        }
            .sortedByDescending { it.size }
            .take(120)
            .map { f ->
                val (w, h) = engine.readImageDimensions(f.uri)
                val estSaved = (f.size * (1f - preset.estimatedRatio)).toLong().coerceAtLeast(0L)
                PhotoCompressCandidate(
                    id = f.id,
                    uri = f.uri,
                    name = f.name,
                    sizeBytes = f.size,
                    width = w,
                    height = h,
                    modified = f.modified,
                    selected = f.size >= 400_000L,
                    estimatedSavedBytes = estSaved
                )
            }
    }

    suspend fun findCompressiblePdfs(
        files: List<FileEntity>,
        preset: PdfCompressPreset = PdfCompressPreset.BALANCED,
        minSizeBytes: Long = 200_000L
    ): List<PdfCompressCandidate> = withContext(Dispatchers.IO) {
        files.filter { f ->
            f.extension.equals("pdf", true) && f.size >= minSizeBytes
        }
            .sortedByDescending { it.size }
            .take(80)
            .map { f ->
                val estSaved = (f.size * (1f - preset.estimatedRatio)).toLong().coerceAtLeast(0L)
                PdfCompressCandidate(
                    id = f.id,
                    uri = f.uri,
                    name = f.name,
                    sizeBytes = f.size,
                    pageCount = f.pageCount.coerceAtLeast(1),
                    modified = f.modified,
                    selected = f.size >= 800_000L,
                    estimatedSavedBytes = estSaved
                )
            }
    }

    suspend fun findOldDownloads(daysThreshold: Int = 90): List<CleanerFileItem> = withContext(Dispatchers.IO) {
        val cutoffMs = System.currentTimeMillis() - daysThreshold * 86_400_000L
        val results = mutableListOf<CleanerFileItem>()
        val roots = buildList {
            if (com.filelenspro.app.util.StoragePermissionHelper.hasAllFilesAccess(context)) {
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)?.let { add(it) }
            }
            add(File(context.filesDir, "Exports"))
        }
        roots.forEach { dir ->
            if (dir.exists() && dir.canRead()) {
                dir.walkTopDown().maxDepth(4)
                    .filter { it.isFile && !it.name.startsWith(".") && it.lastModified() in 1L..cutoffMs && it.length() >= 50_000L }
                    .take(60)
                    .forEach { f ->
                        results.add(
                            CleanerFileItem(
                                path = f.absolutePath,
                                uri = f.toURI().toString(),
                                name = f.name,
                                sizeBytes = f.length(),
                                modifiedMs = f.lastModified(),
                                category = CleanerCategory.OLD_DOWNLOADS
                            )
                        )
                    }
            }
        }
        results.sortedByDescending { it.sizeBytes }.take(60)
    }

    suspend fun findLeftoverApks(): List<CleanerFileItem> = withContext(Dispatchers.IO) {
        val results = mutableListOf<CleanerFileItem>()
        if (!com.filelenspro.app.util.StoragePermissionHelper.hasAllFilesAccess(context)) return@withContext results
        val roots = listOfNotNull(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            Environment.getExternalStorageDirectory()
        )
        val seen = mutableSetOf<String>()
        roots.forEach { dir ->
            if (dir.exists() && dir.canRead()) {
                dir.walkTopDown().maxDepth(4)
                    .onEnter { d -> !d.name.startsWith(".") && d.name != "Android" }
                    .filter { it.isFile && it.extension.equals("apk", true) && seen.add(it.absolutePath) }
                    .take(60)
                    .forEach { f ->
                        results.add(
                            CleanerFileItem(
                                path = f.absolutePath,
                                uri = f.toURI().toString(),
                                name = f.name,
                                sizeBytes = f.length(),
                                modifiedMs = f.lastModified(),
                                category = CleanerCategory.LEFTOVER_APKS,
                                selected = true
                            )
                        )
                    }
            }
        }
        results.sortedByDescending { it.sizeBytes }.take(60)
    }

    suspend fun findLargeVideos(minSizeBytes: Long = 20_000_000L): List<CleanerFileItem> = withContext(Dispatchers.IO) {
        val results = mutableListOf<CleanerFileItem>()
        if (!com.filelenspro.app.util.StoragePermissionHelper.hasAllFilesAccess(context)) return@withContext results
        val videoExts = setOf("mp4", "mkv", "mov", "avi", "webm", "3gp")
        val roots = listOfNotNull(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        )
        val seen = mutableSetOf<String>()
        roots.forEach { dir ->
            if (dir.exists() && dir.canRead()) {
                dir.walkTopDown().maxDepth(4)
                    .onEnter { d -> !d.name.startsWith(".") && d.name != "Android" }
                    .filter {
                        it.isFile &&
                            it.extension.lowercase(Locale.ROOT) in videoExts &&
                            it.length() >= minSizeBytes &&
                            seen.add(it.absolutePath)
                    }
                    .take(50)
                    .forEach { f ->
                        results.add(
                            CleanerFileItem(
                                path = f.absolutePath,
                                uri = f.toURI().toString(),
                                name = f.name,
                                sizeBytes = f.length(),
                                modifiedMs = f.lastModified(),
                                category = CleanerCategory.LARGE_VIDEOS
                            )
                        )
                    }
            }
        }
        results.sortedByDescending { it.sizeBytes }.take(50)
    }

    fun deleteLocalUri(uriString: String): Boolean {
        return try {
            val file = when {
                uriString.startsWith("file://") -> File(Uri.parse(uriString).path ?: return false)
                !uriString.startsWith("content://") -> File(uriString)
                else -> null
            }
            file?.delete() ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun computeDHash(bmp: Bitmap): String {
        val scaled = Bitmap.createScaledBitmap(bmp, 9, 8, true)
        val bits = StringBuilder(64)
        for (y in 0 until 8) {
            for (x in 0 until 8) {
                val p1 = luma(scaled.getPixel(x, y))
                val p2 = luma(scaled.getPixel(x + 1, y))
                bits.append(if (p1 > p2) '1' else '0')
            }
        }
        scaled.recycle()
        return bits.toString()
    }

    private fun computeSharpness(bmp: Bitmap): Double {
        val w = bmp.width
        val h = bmp.height
        if (w < 4 || h < 4) return 0.0
        var sum = 0.0
        var count = 0
        for (y in 1 until h - 1 step 2) {
            for (x in 1 until w - 1 step 2) {
                val c = luma(bmp.getPixel(x, y))
                val lap = abs(4 * c - luma(bmp.getPixel(x - 1, y)) - luma(bmp.getPixel(x + 1, y)) - luma(bmp.getPixel(x, y - 1)) - luma(bmp.getPixel(x, y + 1)))
                sum += lap
                count++
            }
        }
        return if (count > 0) sum / count else 0.0
    }

    private fun luma(pixel: Int): Int {
        return (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000
    }

    private fun hammingDistance(a: String, b: String): Int {
        if (a.length != b.length) return 64
        var dist = 0
        for (i in a.indices) if (a[i] != b[i]) dist++
        return dist
    }

    private fun dirSize(dir: File): Long =
        if (!dir.exists()) 0L else dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }

    private fun countFiles(dir: File): Int =
        if (!dir.exists()) 0 else dir.walkTopDown().count { it.isFile }
}
