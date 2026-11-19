package com.filelenspro.app.domain.engine

import com.filelenspro.app.data.db.FileChunkEntity
import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.MatchOccurrence
import com.filelenspro.app.data.model.SearchFilters
import com.filelenspro.app.data.model.SearchMode
import com.filelenspro.app.data.model.SearchResult
import com.filelenspro.app.data.model.SortColumn
import com.filelenspro.app.data.model.SortOrder
import java.util.Locale

object SearchEngine {

    private val IMAGE_EXTS = setOf("jpg", "jpeg", "png", "gif", "bmp", "webp")
    private val DOC_EXTS = setOf("doc", "docx", "txt", "rtf", "md", "xlsx", "xls", "csv")
    private val AUDIO_EXTS = setOf("mp3", "wav", "ogg", "m4a", "opus", "aac")
    private val VIDEO_EXTS = setOf("mp4", "mkv", "avi", "mov")

    fun search(
        query: String,
        mode: SearchMode,
        filters: SearchFilters,
        sortColumn: SortColumn,
        sortOrder: SortOrder,
        allFiles: List<FileEntity>,
        allChunks: List<FileChunkEntity>
    ): List<SearchResult> {
        val raw = query.trim()
        if (raw.isEmpty()) return emptyList()

        val filteredFiles = applyFilters(allFiles, filters)
        if (filteredFiles.isEmpty()) return emptyList()

        val results = if (mode == SearchMode.SIMILAR) {
            searchSemantic(raw, filteredFiles, allChunks)
        } else {
            searchLexical(raw, mode, filteredFiles)
        }

        val comparator = when (sortColumn) {
            SortColumn.NAME -> compareBy<SearchResult> { it.entry.name.lowercase(Locale.ROOT) }
            SortColumn.SIZE -> compareBy { it.entry.size }
            SortColumn.MODIFIED -> compareBy { it.entry.modified }
            SortColumn.EXTENSION -> compareBy { it.entry.extension.lowercase(Locale.ROOT) }
            SortColumn.SCORE -> compareByDescending { it.score }
        }

        return if (sortColumn == SortColumn.SCORE) {
            if (sortOrder == SortOrder.ASC) results.sortedBy { it.score } else results.sortedByDescending { it.score }
        } else {
            if (sortOrder == SortOrder.ASC) results.sortedWith(comparator) else results.sortedWith(comparator.reversed())
        }
    }

    private fun applyFilters(files: List<FileEntity>, filters: SearchFilters): List<FileEntity> {
        return files.filter { f ->
            val ext = f.extension.lowercase(Locale.ROOT)
            val typeOk = if (filters.fileTypes.isEmpty()) true else {
                val allowed = mutableSetOf<String>()
                if ("Images" in filters.fileTypes) allowed += IMAGE_EXTS
                if ("Documents" in filters.fileTypes) allowed += DOC_EXTS
                if ("PDFs" in filters.fileTypes) allowed += "pdf"
                if ("Audio" in filters.fileTypes) allowed += AUDIO_EXTS
                if ("Video" in filters.fileTypes) allowed += VIDEO_EXTS
                ext in allowed
            }
            val minOk = filters.minSizeBytes?.let { f.size >= it } ?: true
            val maxOk = filters.maxSizeBytes?.let { f.size <= it } ?: true
            val dateOk = filters.modifiedAfterIso?.let { f.modified >= it } ?: true
            val folderOk = filters.folderPrefix?.let { f.uri.startsWith(it, ignoreCase = true) } ?: true
            typeOk && minOk && maxOk && dateOk && folderOk
        }
    }

    private fun searchSemantic(
        rawQuery: String,
        files: List<FileEntity>,
        chunks: List<FileChunkEntity>
    ): List<SearchResult> {
        val hindi = MultilingualEngine.transliterateHinglishToHindi(rawQuery)
        val combined = if (hindi != rawQuery) "$rawQuery $hindi" else rawQuery
        val queryVec = EmbeddingEngine.generateEmbedding(combined)

        val fileMap = files.associateBy { it.id }
        val queryTokens = combined.lowercase(Locale.ROOT).split(Regex("\\s+")).filter { it.isNotBlank() }
        val expandedTerms = linkedSetOf<String>().apply {
            addAll(queryTokens)
            queryTokens.forEach { addAll(MultilingualEngine.getCrossLingualConceptVariants(it)) }
        }

        val bestPerFile = mutableMapOf<Long, Pair<Double, FileChunkEntity>>()
        for (chunk in chunks) {
            if (chunk.fileId !in fileMap) continue
            val chunkVec = EmbeddingEngine.fromByteArray(chunk.embeddingBytes)
            val cos = EmbeddingEngine.cosineSimilarity(queryVec, chunkVec)
            val chunkLower = chunk.chunkText.lowercase(Locale.ROOT)
            val lexicalBonus = if (expandedTerms.any { it.length >= 2 && chunkLower.contains(it) }) 0.25 else 0.0
            val score = (cos + lexicalBonus).coerceIn(0.0, 1.0)
            if (score >= 0.22) {
                val prev = bestPerFile[chunk.fileId]
                if (prev == null || score > prev.first) {
                    bestPerFile[chunk.fileId] = score to chunk
                }
            }
        }

        // Also score files that may not have chunks yet using title + OCR text
        for (file in files) {
            if (file.id in bestPerFile) continue
            val fullText = listOfNotNull(file.name, file.customTag, file.contentText, file.ocrText).joinToString(" ")
            if (fullText.isBlank()) continue
            val docVec = EmbeddingEngine.generateEmbedding(fullText.take(1200))
            val cos = EmbeddingEngine.cosineSimilarity(queryVec, docVec)
            val lower = fullText.lowercase(Locale.ROOT)
            val lexicalBonus = if (expandedTerms.any { it.length >= 2 && lower.contains(it) }) 0.28 else 0.0
            val score = (cos + lexicalBonus).coerceIn(0.0, 1.0)
            if (score >= 0.24) {
                bestPerFile[file.id] = score to FileChunkEntity(
                    fileId = file.id,
                    chunkIndex = 0,
                    chunkText = fullText.take(220),
                    pageNumber = 1,
                    embeddingBytes = ByteArray(0)
                )
            }
        }

        return bestPerFile.mapNotNull { (fileId, pair) ->
            val file = fileMap[fileId] ?: return@mapNotNull null
            val (score, chunk) = pair
            val cleanSnippet = chunk.chunkText.replace(Regex("\\s+"), " ").trim().take(180)
            SearchResult(
                entry = file,
                score = score,
                matchedField = "semantic",
                preview = "[Page ${chunk.pageNumber}] $cleanSnippet",
                matchCount = (score * 100).toInt().coerceIn(1, 100),
                pageNumbers = listOf(chunk.pageNumber),
                semanticScore = score
            )
        }.sortedByDescending { it.score }
    }

    private fun searchLexical(
        rawQuery: String,
        mode: SearchMode,
        files: List<FileEntity>
    ): List<SearchResult> {
        val isQuoted = (rawQuery.startsWith("\"") && rawQuery.endsWith("\"") && rawQuery.length > 2)
        val cleanQuery = if (isQuoted) rawQuery.substring(1, rawQuery.length - 1).trim() else rawQuery
        val effectiveMode = if (isQuoted) SearchMode.EXACT else mode

        val tokens = cleanQuery.lowercase(Locale.ROOT)
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }

        val expandedTerms = linkedSetOf<String>().apply {
            add(cleanQuery.lowercase(Locale.ROOT))
            for (tok in tokens) {
                add(tok)
                if (effectiveMode == SearchMode.PARTIAL) {
                    addAll(MultilingualEngine.transliterateSingleWord(tok).map { it.lowercase(Locale.ROOT) })
                    addAll(MultilingualEngine.getCrossLingualConceptVariants(tok).map { it.lowercase(Locale.ROOT) })
                }
            }
        }

        val out = mutableListOf<SearchResult>()
        for (file in files) {
            val nameLower = file.name.lowercase(Locale.ROOT)
            val tagLower = file.customTag.lowercase(Locale.ROOT)
            val contentText = listOfNotNull(file.contentText, file.ocrText).joinToString("\n\n")
            val contentLower = contentText.lowercase(Locale.ROOT)
            val combinedLower = "$nameLower $tagLower $contentLower"

            val matched = when (effectiveMode) {
                SearchMode.EXACT -> combinedLower.contains(cleanQuery.lowercase(Locale.ROOT))
                SearchMode.WHOLE_WORD -> {
                    val rx = Regex("\\b${Regex.escape(cleanQuery)}\\b", RegexOption.IGNORE_CASE)
                    rx.containsMatchIn(file.name) || rx.containsMatchIn(file.customTag) || rx.containsMatchIn(contentText)
                }
                SearchMode.WILDCARD -> {
                    tokens.all { tok ->
                        val pat = tok.replace("*", ".*").replace("?", ".")
                        Regex(pat, RegexOption.IGNORE_CASE).containsMatchIn(combinedLower)
                    }
                }
                SearchMode.BOOLEAN -> evaluateBoolean(cleanQuery, combinedLower)
                else -> {
                    tokens.all { tok ->
                        val vars = listOf(tok) + MultilingualEngine.transliterateSingleWord(tok)
                        vars.any { v -> combinedLower.contains(v.lowercase(Locale.ROOT)) }
                    } || expandedTerms.any { it.length >= 3 && combinedLower.contains(it) }
                }
            }

            if (!matched) continue

            val occurrences = findOccurrences(contentText, cleanQuery, wholeWord = effectiveMode == SearchMode.WHOLE_WORD)
            val nameHits = if (nameLower.contains(cleanQuery.lowercase(Locale.ROOT))) 5.0 else 0.0
            val tagHits = if (tagLower.contains(cleanQuery.lowercase(Locale.ROOT))) 4.0 else 0.0
            val score = nameHits + tagHits + occurrences.size.coerceAtLeast(1) * 1.2

            val firstHit = occurrences.firstOrNull()
            val preview = if (firstHit != null) {
                val start = (firstHit.start - 45).coerceAtLeast(0)
                val end = (firstHit.end + 85).coerceAtMost(contentText.length)
                (if (start > 0) "…" else "") +
                    contentText.substring(start, end).replace(Regex("\\s+"), " ").trim() +
                    (if (end < contentText.length) "…" else "")
            } else {
                contentText.replace(Regex("\\s+"), " ").trim().take(120)
            }

            val pages = extractPageNumbers(contentText, occurrences)
            val matchedField = when {
                nameLower.contains(cleanQuery.lowercase(Locale.ROOT)) -> "filename"
                !file.contentText.isNullOrBlank() && file.contentText.lowercase(Locale.ROOT).contains(cleanQuery.lowercase(Locale.ROOT)) -> "content"
                else -> "ocr_text"
            }

            out.add(
                SearchResult(
                    entry = file,
                    score = score,
                    matchedField = matchedField,
                    preview = preview,
                    matchCount = occurrences.size.coerceAtLeast(1),
                    pageNumbers = pages
                )
            )
        }
        return out.sortedByDescending { it.score }
    }

    private fun evaluateBoolean(query: String, textLower: String): Boolean {
        val orBranches = query.split(Regex("\\s+OR\\s+", RegexOption.IGNORE_CASE))
        return orBranches.any { branch ->
            val normalized = branch.trim().replace(Regex("\\s+NOT\\s+", RegexOption.IGNORE_CASE), " AND NOT ")
            val parts = normalized.split(Regex("\\s+AND\\s+", RegexOption.IGNORE_CASE))
            parts.all { part ->
                val trimmed = part.trim()
                if (trimmed.isEmpty()) true
                else if (trimmed.startsWith("NOT ", ignoreCase = true)) {
                    val neg = trimmed.substring(4).trim().lowercase(Locale.ROOT)
                    neg.isNotEmpty() && !textLower.contains(neg)
                } else {
                    textLower.contains(trimmed.lowercase(Locale.ROOT))
                }
            }
        }
    }

    fun findOccurrences(
        text: String,
        query: String,
        caseSensitive: Boolean = false,
        wholeWord: Boolean = false
    ): List<MatchOccurrence> {
        val q = query.trim()
        if (text.isBlank() || q.isBlank()) return emptyList()

        val regex = try {
            val options = if (caseSensitive) emptySet() else setOf(RegexOption.IGNORE_CASE)
            if (wholeWord) {
                Regex("\\b${Regex.escape(q)}\\b", options)
            } else {
                val terms = linkedSetOf(q)
                q.lowercase(Locale.ROOT).split(Regex("\\s+")).filter { it.isNotBlank() }.forEach { tok ->
                    terms.add(tok)
                    terms.addAll(MultilingualEngine.transliterateSingleWord(tok))
                }
                Regex(terms.filter { it.isNotBlank() }.joinToString("|") { Regex.escape(it) }, options)
            }
        } catch (_: Exception) {
            return emptyList()
        }

        val lineStarts = mutableListOf(0)
        for (i in text.indices) {
            if (text[i] == '\n') lineStarts.add(i + 1)
        }

        return regex.findAll(text).take(500).map { m ->
            val start = m.range.first
            val lineIdx = lineStarts.binarySearch(start).let { if (it >= 0) it else (-it - 2).coerceAtLeast(0) }
            MatchOccurrence(
                start = start,
                end = m.range.last + 1,
                line = lineIdx + 1,
                column = start - lineStarts[lineIdx] + 1,
                snippet = m.value
            )
        }.toList()
    }

    private fun extractPageNumbers(content: String, occurrences: List<MatchOccurrence>): List<Int> {
        if (content.isBlank() || occurrences.isEmpty()) return emptyList()
        val pageMarkers = Regex("\\[Page (\\d+)]").findAll(content)
            .map { it.range.first to (it.groupValues[1].toIntOrNull() ?: 1) }
            .toList()
        if (pageMarkers.isEmpty()) return emptyList()

        val pages = linkedSetOf<Int>()
        for (occ in occurrences) {
            var page = 1
            for ((idx, num) in pageMarkers) {
                if (idx <= occ.start) page = num else break
            }
            pages.add(page)
        }
        return pages.toList()
    }
}
