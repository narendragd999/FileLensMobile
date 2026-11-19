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
    val currentFile: String
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
