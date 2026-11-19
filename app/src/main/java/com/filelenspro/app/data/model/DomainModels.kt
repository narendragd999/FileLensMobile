package com.filelenspro.app.data.model

import com.filelenspro.app.data.db.FileEntity
import kotlinx.serialization.Serializable

enum class SearchMode(val id: String, val label: String) {
    PARTIAL("partial", "Quick Search"),
    SIMILAR("similar", "Natural Language"),
    EXACT("exact", "Exact Match"),
    WHOLE_WORD("whole_word", "Whole Word"),
    WILDCARD("wildcard", "Wildcard"),
    BOOLEAN("boolean", "Boolean")
}

enum class SortColumn(val id: String, val label: String) {
    SCORE("score", "Score"),
    NAME("name", "Name"),
    SIZE("size", "Size"),
    MODIFIED("modified", "Modified"),
    EXTENSION("extension", "Type")
}

enum class SortOrder { ASC, DESC }

data class SearchFilters(
    val fileTypes: Set<String> = emptySet(),
    val minSizeBytes: Long? = null,
    val maxSizeBytes: Long? = null,
    val modifiedAfterIso: String? = null,
    val folderPrefix: String? = null
) {
    val isActive: Boolean
        get() = fileTypes.isNotEmpty() || minSizeBytes != null || maxSizeBytes != null || modifiedAfterIso != null || !folderPrefix.isNullOrBlank()
}

data class SearchResult(
    val entry: FileEntity,
    val score: Double,
    val matchedField: String,
    val preview: String,
    val matchCount: Int,
    val pageNumbers: List<Int>,
    val semanticScore: Double? = null
)

data class MatchOccurrence(
    val start: Int,
    val end: Int,
    val line: Int,
    val column: Int,
    val snippet: String
)

@Serializable
data class ChecklistItem(
    val id: String,
    val text: String,
    val completed: Boolean = false,
    val dueDatetime: String? = null
)

data class TemporalExtractionResult(
    val temporalClass: String, // "today" | "future" | "historical"
    val resolvedDatetime: String?,
    val actionItems: List<String>,
    val isHighConfidenceReminder: Boolean,
    val checklistItems: List<ChecklistItem>
)

data class SmartDataSummary(
    val dates: List<String> = emptyList(),
    val amounts: List<String> = emptyList(),
    val phones: List<String> = emptyList(),
    val emails: List<String> = emptyList(),
    val ids: List<String> = emptyList()
)

data class SmartCategory(
    val id: String,
    val label: String,
    val hindi: String,
    val anchorText: String
)

data class RelatedCardMatch(
    val cardId: Long,
    val name: String,
    val customTag: String,
    val similarity: Double
)

data class DuplicateGroup(
    val hash: String,
    val size: Long,
    val files: List<DuplicateFileItem>
)

data class DuplicateFileItem(
    val id: Long,
    val uri: String,
    val name: String,
    val size: Long,
    val modified: String,
    val isOriginal: Boolean,
    val selectedForDeletion: Boolean
)

data class SimilarImageItem(
    val id: Long,
    val uri: String,
    val name: String,
    val size: Long,
    val sharpness: Double,
    val dHash: String,
    val isBestShot: Boolean,
    val selectedForDeletion: Boolean
)

data class VisualCluster(
    val clusterId: String,
    val items: List<SimilarImageItem>
)

data class SemanticDuplicateGroup(
    val groupId: String,
    val similarity: Double,
    val files: List<FileEntity>,
    val selectedIds: Set<Long>
)

data class StorageCategoryStat(
    val label: String,
    val bytes: Long,
    val count: Int
)

data class StorageAnalysis(
    val totalDeviceBytes: Long,
    val freeDeviceBytes: Long,
    val usedDeviceBytes: Long,
    val appIndexedBytes: Long,
    val categories: List<StorageCategoryStat>,
    val largeFiles: List<FileEntity>
)

data class JunkCacheStats(
    val pdfCacheBytes: Long,
    val tempCropBytes: Long,
    val exportTempBytes: Long,
    val totalJunkBytes: Long,
    val fileCount: Int
)

data class StorageItem(
    val id: String,
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val size: Long,
    val modifiedMs: Long,
    val extension: String,
    val mimeType: String
)

data class LanguageOption(
    val code: String,
    val name: String,
    val nativeName: String,
    val flag: String
)

data class IndexProgress(
    val indexed: Int,
    val total: Int,
    val currentFile: String,
    val phase: String = "Indexing",
    val skippedUnchanged: Int = 0,
    val removedDeleted: Int = 0,
    val isFullDevice: Boolean = false
)

data class DeviceIndexSummary(
    val newOrUpdated: Int,
    val skippedUnchanged: Int,
    val removedDeleted: Int,
    val totalScanned: Int,
    val elapsedMs: Long,
    val isFullDevice: Boolean,
    val wasCancelled: Boolean = false,
    val timestampIso: String
)

data class IndexStats(
    val totalFiles: Int = 0,
    val ocrDone: Int = 0,
    val ocrPending: Int = 0,
    val cardsCount: Int = 0
)

data class IncomingIntentRecommendation(
    val target: String, // "brain" | "card"
    val confidence: Double,
    val suggestedTitle: String
)

enum class PhotoCompressPreset(
    val id: String,
    val label: String,
    val subtitle: String,
    val maxDimension: Int,
    val quality: Int,
    val estimatedRatio: Float
) {
    LOSSLESS_LOOK(
        id = "lossless_look",
        label = "Smart Lossless",
        subtitle = "Zero visible loss · up to 2560px · WebP/JPEG 84%",
        maxDimension = 2560,
        quality = 84,
        estimatedRatio = 0.36f
    ),
    MAX_QUALITY(
        id = "max_quality",
        label = "Studio Crisp",
        subtitle = "Keep full resolution · metadata stripped · 90%",
        maxDimension = 3840,
        quality = 90,
        estimatedRatio = 0.54f
    ),
    ULTRA_COMPACT(
        id = "ultra_compact",
        label = "Max Space",
        subtitle = "Crisp 1920px HD · 76% adaptive compression",
        maxDimension = 1920,
        quality = 76,
        estimatedRatio = 0.22f
    )
}

data class PhotoCompressCandidate(
    val id: Long,
    val uri: String,
    val name: String,
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
    val modified: String,
    val selected: Boolean = true,
    val estimatedSavedBytes: Long = 0L
)

data class PhotoCompressSummary(
    val processedCount: Int,
    val skippedAlreadyOptimal: Int,
    val originalTotalBytes: Long,
    val compressedTotalBytes: Long,
    val savedBytes: Long
)

enum class PdfPageSizePreset(val id: String, val label: String) {
    AUTO("auto", "Auto Fit"),
    A4("a4", "A4"),
    LETTER("letter", "US Letter")
}

enum class PdfQualityPreset(val id: String, val label: String, val maxDim: Int, val jpegQuality: Float) {
    HIGH("high", "High", 2400, 0.92f),
    BALANCED("balanced", "Balanced", 1800, 0.82f),
    COMPACT("compact", "Small PDF", 1400, 0.68f)
}

/**
 * 4 normalized corners in [0f..1f] image coordinates:
 * Top-Left, Top-Right, Bottom-Right, Bottom-Left.
 */
data class NormalizedQuad(
    val tlX: Float = 0.08f,
    val tlY: Float = 0.10f,
    val trX: Float = 0.92f,
    val trY: Float = 0.10f,
    val brX: Float = 0.92f,
    val brY: Float = 0.90f,
    val blX: Float = 0.08f,
    val blY: Float = 0.90f,
    val confidence: Float = 0f
) {
    fun isFullFrame(): Boolean =
        tlX <= 0.01f && tlY <= 0.01f &&
            trX >= 0.99f && trY <= 0.01f &&
            brX >= 0.99f && brY >= 0.99f &&
            blX <= 0.01f && blY >= 0.99f

    companion object {
        val FULL = NormalizedQuad(0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f, 0f)
    }
}

enum class PdfCompressPreset(
    val id: String,
    val label: String,
    val subtitle: String,
    val maxDimension: Int,
    val jpegQuality: Float,
    val estimatedRatio: Float
) {
    EMAIL_SMALL(
        id = "email_small",
        label = "Email Ready",
        subtitle = "Ultra-small · 1280px · 62% quality",
        maxDimension = 1280,
        jpegQuality = 0.62f,
        estimatedRatio = 0.28f
    ),
    BALANCED(
        id = "balanced",
        label = "Balanced",
        subtitle = "Sharp text & photos · 1700px · 76% quality",
        maxDimension = 1700,
        jpegQuality = 0.76f,
        estimatedRatio = 0.45f
    ),
    PRINT_HIGH(
        id = "print_high",
        label = "Print High",
        subtitle = "Crisp print detail · 2200px · 86% quality",
        maxDimension = 2200,
        jpegQuality = 0.86f,
        estimatedRatio = 0.68f
    )
}

data class PdfCompressCandidate(
    val id: Long,
    val uri: String,
    val name: String,
    val sizeBytes: Long,
    val pageCount: Int,
    val modified: String,
    val selected: Boolean = true,
    val estimatedSavedBytes: Long = 0L
)

data class PdfCompressSummary(
    val processedCount: Int,
    val skippedAlreadyOptimal: Int,
    val originalTotalBytes: Long,
    val compressedTotalBytes: Long,
    val savedBytes: Long
)

/**
 * Normalized placement of a signature stamp on a page/image.
 * posX/posY represent the top-left corner in [0f..1f] page coordinates.
 */
data class SignaturePlacement(
    val posX: Float = 0.60f,
    val posY: Float = 0.78f,
    val widthFraction: Float = 0.30f,
    val includeDateStamp: Boolean = false
)

data class SavedSignatureItem(
    val filePath: String,
    val name: String,
    val createdMs: Long
)

enum class ExpiryUrgency {
    EXPIRED,
    CRITICAL, // <= 30 days
    UPCOMING, // <= 90 days
    SAFE
}

data class ExpiryRadarItem(
    val file: FileEntity,
    val docType: String,
    val expiryDateIso: String,
    val daysRemaining: Long,
    val urgency: ExpiryUrgency,
    val matchedContext: String
)

enum class CleanerCategory(val label: String) {
    OLD_DOWNLOADS("Old Downloads (90+d)"),
    LEFTOVER_APKS("Leftover APKs"),
    LARGE_VIDEOS("Large Videos")
}

data class CleanerFileItem(
    val path: String,
    val uri: String,
    val name: String,
    val sizeBytes: Long,
    val modifiedMs: Long,
    val category: CleanerCategory,
    val selected: Boolean = false
)

@Serializable
data class BackupVoiceNote(
    val uri: String,
    val title: String,
    val rawTranscript: String,
    val temporalClass: String,
    val resolvedDatetime: String? = null,
    val actionItemsJson: String = "[]",
    val isReminderSet: Boolean = false,
    val imageUrisJson: String = "[]",
    val linkedDocUri: String = "",
    val linkedDocName: String = "",
    val linkedDocType: String = "",
    val createdAt: String,
    val recurrenceRule: String = "none"
)

@Serializable
data class BackupBookmark(
    val fileUri: String,
    val fileName: String,
    val extension: String = "",
    val size: Long = 0,
    val modified: String = "",
    val tagsJson: String = "[]",
    val createdAt: String
)

@Serializable
data class BackupSavedSearch(
    val query: String,
    val mode: String = "partial",
    val createdAt: String
)

@Serializable
data class BackupCardTag(
    val fileUri: String,
    val isCard: Boolean,
    val customTag: String
)

@Serializable
data class BackupSignatureEntry(
    val fileName: String,
    val pngBase64: String
)

@Serializable
data class BackupPayload(
    val formatVersion: Int = 1,
    val exportedAtIso: String,
    val voiceNotes: List<BackupVoiceNote> = emptyList(),
    val bookmarks: List<BackupBookmark> = emptyList(),
    val savedSearches: List<BackupSavedSearch> = emptyList(),
    val cardTags: List<BackupCardTag> = emptyList(),
    val signatures: List<BackupSignatureEntry> = emptyList()
)


