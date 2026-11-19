package com.filelenspro.app.domain.engine

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.sqrt

object EmbeddingEngine {
    const val EMBEDDING_DIMENSION = 384
    private val WORD_REGEX = Regex("[\\u0900-\\u097F]+|[a-z0-9]+|[^\\s\\w\\u0900-\\u097F]")

    fun l2Normalize(vector: FloatArray): FloatArray {
        var sumSq = 0.0
        for (v in vector) sumSq += v * v
        val norm = sqrt(sumSq).toFloat()
        if (norm < 1e-12f) return vector
        for (i in vector.indices) vector[i] /= norm
        return vector
    }

    fun cosineSimilarity(a: FloatArray, b: FloatArray): Double {
        if (a.size != b.size) return 0.0
        var dot = 0.0
        for (i in a.indices) dot += a[i] * b[i]
        return dot
    }

    fun generateEmbedding(text: String): FloatArray {
        val vector = FloatArray(EMBEDDING_DIMENSION)
        if (text.isBlank()) return vector

        val normalized = MultilingualEngine.normalizeText(text)
        val words = WORD_REGEX.findAll(normalized).map { it.value }.toList()

        for (i in words.indices) {
            val word = words[i]
            val weight = if (word.any { it.isDigit() } || word.length <= 4) 1.6f else 1.0f

            // 1. Multi-seed FNV-1a unigram hashing
            for (seed in 0 until 4) {
                var hash = (2166136261L.toInt()) xor seed
                for (ch in word) {
                    hash = (hash xor ch.code) * 16777619
                }
                val dim = abs(hash) % EMBEDDING_DIMENSION
                val sign = if ((hash and 1) == 0) 1f else -1f
                vector[dim] += sign * weight
            }

            // 2. Phonetic Soundex invariant projection
            val soundex = MultilingualEngine.toUniversalSoundex(word)
            if (soundex.length >= 2) {
                for (seed in 0 until 4) {
                    var sHash = (2166136261L.toInt()) xor seed
                    for (ch in soundex) {
                        sHash = (sHash xor ch.code) * 16777619
                    }
                    val dim = abs(sHash) % EMBEDDING_DIMENSION
                    val sign = if ((sHash and 1) == 0) 1f else -1f
                    vector[dim] += sign * 1.8f * weight
                }
            }

            // 3. Word bigrams
            if (i < words.lastIndex) {
                val bigram = "${word}_${words[i + 1]}"
                var biHash = 2166136261L.toInt()
                for (ch in bigram) {
                    biHash = (biHash xor ch.code) * 16777619
                }
                val dim = abs(biHash) % EMBEDDING_DIMENSION
                val sign = if ((biHash and 1) == 0) 1f else -1f
                vector[dim] += sign * 1.5f * weight
            }

            // 4. Character 3-grams and 4-grams for typo & stem invariance
            if (word.length >= 3) {
                for (j in 0..word.length - 3) {
                    val tri = word.substring(j, j + 3)
                    var triHash = 2166136261L.toInt()
                    for (ch in tri) triHash = (triHash xor ch.code) * 16777619
                    val dim = abs(triHash) % EMBEDDING_DIMENSION
                    val sign = if ((triHash and 1) == 0) 1f else -1f
                    vector[dim] += sign * 0.5f
                }
            }
            if (word.length >= 4) {
                for (j in 0..word.length - 4) {
                    val four = word.substring(j, j + 4)
                    var fourHash = 2166136261L.toInt()
                    for (ch in four) fourHash = (fourHash xor ch.code) * 16777619
                    val dim = abs(fourHash) % EMBEDDING_DIMENSION
                    val sign = if ((fourHash and 1) == 0) 1f else -1f
                    vector[dim] += sign * 0.6f
                }
            }
        }

        return l2Normalize(vector)
    }

    fun toByteArray(vector: FloatArray): ByteArray {
        val buf = ByteBuffer.allocate(vector.size * 4).order(ByteOrder.LITTLE_ENDIAN)
        for (v in vector) buf.putFloat(v)
        return buf.array()
    }

    fun fromByteArray(bytes: ByteArray): FloatArray {
        if (bytes.size < EMBEDDING_DIMENSION * 4) return FloatArray(EMBEDDING_DIMENSION)
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return FloatArray(EMBEDDING_DIMENSION) { buf.getFloat() }
    }

    fun chunkText(text: String, chunkSize: Int = 550, overlap: Int = 80): List<Pair<Int, String>> {
        if (text.isBlank()) return emptyList()
        val chunks = mutableListOf<Pair<Int, String>>()
        val pageRegex = Regex("\\[Page (\\d+)]")
        var currentPage = 1
        var idx = 0
        while (idx < text.length) {
            val end = (idx + chunkSize).coerceAtMost(text.length)
            val slice = text.substring(idx, end).trim()
            val pageMatch = pageRegex.findAll(slice).lastOrNull()
            if (pageMatch != null) {
                currentPage = pageMatch.groupValues[1].toIntOrNull() ?: currentPage
            }
            if (slice.isNotBlank()) {
                chunks.add(currentPage to slice)
            }
            if (end >= text.length) break
            idx = (end - overlap).coerceAtLeast(idx + 1)
        }
        return chunks
    }
}
