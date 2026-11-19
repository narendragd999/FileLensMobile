package com.filelenspro.app.domain.engine

import com.filelenspro.app.data.db.FileEntity
import com.filelenspro.app.data.model.ExpiryRadarItem
import com.filelenspro.app.data.model.ExpiryUrgency
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

object ExpiryRadarEngine {

    private val EXPIRY_KEYWORDS = Regex(
        """(?i)\b(expir\w*|valid\s*(?:thru|through|upto|up\s*to|till|until)|due\s*(?:date|by|on)|renewal|renew\s*by|doe|date\s*of\s*expiry|validity|policy\s*end|warranty\s*(?:ends?|valid|until)|fitness\s*upto|reg\.?\s*valid)\b"""
    )

    private val DOC_TYPE_DETECTORS = listOf(
        "Passport" to Regex("""(?i)\b(passport|republic of india.*passport|p<ind)\b"""),
        "Driving License" to Regex("""(?i)\b(driving\s*licen[cs]e|dl\s*no|transport\s*dept|mcwg|lmv)\b"""),
        "Insurance Policy" to Regex("""(?i)\b(insurance|policy\s*no|premium|sum\s*insured|mediclaim|third\s*party|lic\b)\b"""),
        "Vehicle RC" to Regex("""(?i)\b(registration\s*certificate|rc\s*book|chassis\s*no|engine\s*no|parivahan|puc\b|pollution\s*under\s*control)\b"""),
        "Warranty" to Regex("""(?i)\b(warranty|guarantee\s*card|amc\b|extended\s*care)\b"""),
        "Visa / Permit" to Regex("""(?i)\b(visa|permit|residence\s*card)\b"""),
        "Payment Card" to Regex("""(?i)\b(visa|mastercard|rupay|debit\s*card|credit\s*card|valid\s*thru)\b"""),
        "ID / Document" to Regex("""(?i)\b(aadhaar|pan\s*card|voter|id\s*card|certificate|membership|subscription|bill|invoice)\b""")
    )

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    private val DMY_REGEX = Regex("""\b(0?[1-9]|[12]\d|3[01])[/\-.](0?[1-9]|1[0-2])[/\-.](20\d{2})\b""")

    // YYYY-MM-DD or YYYY/MM/DD
    private val YMD_REGEX = Regex("""\b(20\d{2})[/\-.](0?[1-9]|1[0-2])[/\-.](0?[1-9]|[12]\d|3[01])\b""")

    // DD MMM YYYY or DD MMMM YYYY (e.g. 15 Aug 2027)
    private val TEXT_DATE_REGEX = Regex(
        """(?i)\b(0?[1-9]|[12]\d|3[01])\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+(20\d{2})\b"""
    )

    // MM/YYYY or MM/YY (only used when near an expiry keyword)
    private val MY_REGEX = Regex("""\b(0[1-9]|1[0-2])[/\-](20\d{2}|\d{2})\b""")

    private val MONTH_MAP = mapOf(
        "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
        "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12
    )

    fun scan(
        files: List<FileEntity>,
        today: LocalDate = LocalDate.now(),
        includeBeyondOneYear: Boolean = true
    ): List<ExpiryRadarItem> {
        val items = mutableListOf<ExpiryRadarItem>()
        for (file in files) {
            val combined = buildString {
                append(file.name).append('\n')
                if (file.customTag.isNotBlank()) append(file.customTag).append('\n')
                if (!file.ocrText.isNullOrBlank()) append(file.ocrText).append('\n')
                if (!file.contentText.isNullOrBlank()) append(file.contentText.take(6000))
            }
            if (combined.length < 6) continue

            val candidate = extractBestExpiryDate(combined, today, file.isCard) ?: continue
            val daysRemaining = ChronoUnit.DAYS.between(today, candidate.first)

            // Ignore dates from long ago (> 365 days expired) or absurdly far (> 15 years)
            if (daysRemaining < -365L || daysRemaining > 365L * 15L) continue
            if (!includeBeyondOneYear && daysRemaining > 365L) continue

            val urgency = when {
                daysRemaining < 0L -> ExpiryUrgency.EXPIRED
                daysRemaining <= 30L -> ExpiryUrgency.CRITICAL
                daysRemaining <= 90L -> ExpiryUrgency.UPCOMING
                else -> ExpiryUrgency.SAFE
            }

            val docType = detectDocType(file, combined)
            items.add(
                ExpiryRadarItem(
                    file = file,
                    docType = docType,
                    expiryDateIso = candidate.first.format(DateTimeFormatter.ISO_LOCAL_DATE),
                    daysRemaining = daysRemaining,
                    urgency = urgency,
                    matchedContext = candidate.second
                )
            )
        }
        return items.sortedWith(compareBy<ExpiryRadarItem> { it.daysRemaining }.thenBy { it.file.name.lowercase(Locale.ROOT) })
    }

    private fun detectDocType(file: FileEntity, text: String): String {
        if (file.customTag.isNotBlank()) return file.customTag
        for ((label, regex) in DOC_TYPE_DETECTORS) {
            if (regex.containsMatchIn(text)) return label
        }
        return if (file.isCard) "Smart Card" else "Document"
    }

    private fun extractBestExpiryDate(
        text: String,
        today: LocalDate,
        isCard: Boolean
    ): Pair<LocalDate, String>? {
        val lines = text.lines()
        val keywordAnchored = mutableListOf<Pair<LocalDate, String>>()
        val generalDates = mutableListOf<Pair<LocalDate, String>>()

        for (i in lines.indices) {
            val line = lines[i].trim()
            if (line.isBlank()) continue
            val prevLine = if (i > 0) lines[i - 1].trim() else ""
            val hasKeyword = EXPIRY_KEYWORDS.containsMatchIn(line) || EXPIRY_KEYWORDS.containsMatchIn(prevLine)
            val contextSnippet = line.take(72)

            val parsedDates = parseDatesInLine(line, allowMonthYear = hasKeyword)
            for (d in parsedDates) {
                if (hasKeyword) {
                    keywordAnchored.add(d to contextSnippet)
                } else {
                    generalDates.add(d to contextSnippet)
                }
            }
        }

        if (keywordAnchored.isNotEmpty()) {
            // Prefer the nearest upcoming or recently expired date anchored to an expiry keyword
            val upcoming = keywordAnchored.filter { !it.first.isBefore(today.minusDays(365)) }
            val chosen = upcoming.maxByOrNull { it.first } ?: keywordAnchored.maxByOrNull { it.first }
            if (chosen != null) return chosen
        }

        // For tagged cards or known expiring documents without explicit keyword on same line,
        // accept future dates within 10 years (avoids picking DOB/issue dates in the past)
        val likelyExpiringDoc = isCard || DOC_TYPE_DETECTORS.take(6).any { it.second.containsMatchIn(text) }
        if (likelyExpiringDoc && generalDates.isNotEmpty()) {
            val futureDates = generalDates.filter { it.first.isAfter(today.minusDays(30)) && it.first.isBefore(today.plusYears(10)) }
            if (futureDates.isNotEmpty()) {
                return futureDates.maxByOrNull { it.first }
            }
        }
        return null
    }

    private fun parseDatesInLine(line: String, allowMonthYear: Boolean): List<LocalDate> {
        val found = mutableListOf<LocalDate>()

        DMY_REGEX.findAll(line).forEach { m ->
            val d = m.groupValues[1].toIntOrNull() ?: return@forEach
            val mo = m.groupValues[2].toIntOrNull() ?: return@forEach
            val y = m.groupValues[3].toIntOrNull() ?: return@forEach
            runCatching { LocalDate.of(y, mo, d) }.getOrNull()?.let { found.add(it) }
        }

        YMD_REGEX.findAll(line).forEach { m ->
            val y = m.groupValues[1].toIntOrNull() ?: return@forEach
            val mo = m.groupValues[2].toIntOrNull() ?: return@forEach
            val d = m.groupValues[3].toIntOrNull() ?: return@forEach
            runCatching { LocalDate.of(y, mo, d) }.getOrNull()?.let { found.add(it) }
        }

        TEXT_DATE_REGEX.findAll(line).forEach { m ->
            val d = m.groupValues[1].toIntOrNull() ?: return@forEach
            val monKey = m.groupValues[2].take(3).lowercase(Locale.ROOT)
            val mo = MONTH_MAP[monKey] ?: return@forEach
            val y = m.groupValues[3].toIntOrNull() ?: return@forEach
            runCatching { LocalDate.of(y, mo, d) }.getOrNull()?.let { found.add(it) }
        }

        if (allowMonthYear && found.isEmpty()) {
            MY_REGEX.findAll(line).forEach { m ->
                val mo = m.groupValues[1].toIntOrNull() ?: return@forEach
                val rawY = m.groupValues[2].toIntOrNull() ?: return@forEach
                val y = if (rawY < 100) 2000 + rawY else rawY
                if (y in 2020..2045) {
                    runCatching { YearMonth.of(y, mo).atEndOfMonth() }.getOrNull()?.let { found.add(it) }
                }
            }
        }
        return found
    }
}
