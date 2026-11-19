package com.filelenspro.app.domain.engine

import com.filelenspro.app.data.model.ChecklistItem
import com.filelenspro.app.data.model.SmartDataSummary
import com.filelenspro.app.data.model.TemporalExtractionResult
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object TemporalExtractor {

    private val json = Json { ignoreUnknownKeys = true }

    private val MONTHS = mapOf(
        "january" to 1, "jan" to 1, "जनवरी" to 1,
        "february" to 2, "feb" to 2, "फरवरी" to 2,
        "march" to 3, "mar" to 3, "मार्च" to 3,
        "april" to 4, "apr" to 4, "अप्रैल" to 4,
        "may" to 5, "मई" to 5,
        "june" to 6, "jun" to 6, "जून" to 6,
        "july" to 7, "jul" to 7, "जुलाई" to 7,
        "august" to 8, "aug" to 8, "अगस्त" to 8,
        "september" to 9, "sep" to 9, "sept" to 9, "सितंबर" to 9,
        "october" to 10, "oct" to 10, "अक्टूबर" to 10,
        "november" to 11, "nov" to 11, "नवंबर" to 11,
        "december" to 12, "dec" to 12, "दिसंबर" to 12
    )

    fun extractTemporalAndActionItems(text: String): TemporalExtractionResult {
        val trimmed = text.trim()
        val lower = trimmed.lowercase(Locale.ROOT)
        val now = LocalDateTime.now()
        var targetDate = now.toLocalDate()
        var temporalClass = "today"
        var hasExplicitFutureCue = false
        var hour = 9
        var minute = 0
        var hasExplicitTime = false

        // 1. Relative date detection (English + Hinglish + Hindi)
        when {
            lower.contains("day after tomorrow") || lower.contains("parson") || lower.contains("परसों") -> {
                targetDate = targetDate.plusDays(2)
                temporalClass = "future"
                hasExplicitFutureCue = true
            }
            lower.contains("tomorrow") || Regex("\\b(kal|cal)\\b").containsMatchIn(lower) || lower.contains("कल") -> {
                targetDate = targetDate.plusDays(1)
                temporalClass = "future"
                hasExplicitFutureCue = true
            }
            lower.contains("next week") || lower.contains("agle hafte") || lower.contains("अगले हफ्ते") -> {
                targetDate = targetDate.plusDays(7)
                temporalClass = "future"
                hasExplicitFutureCue = true
            }
            lower.contains("yesterday") || lower.contains("last week") || lower.contains("archive") -> {
                temporalClass = "historical"
            }
        }

        // 2. Explicit DD/MM/YYYY or DD-MM-YYYY
        val numericDate = Regex("\\b(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?\\b").find(lower)
        if (numericDate != null) {
            val d = numericDate.groupValues[1].toIntOrNull()
            val m = numericDate.groupValues[2].toIntOrNull()
            val yRaw = numericDate.groupValues[3].toIntOrNull()
            val y = when {
                yRaw == null -> now.year
                yRaw < 100 -> 2000 + yRaw
                else -> yRaw
            }
            if (d != null && m != null && d in 1..31 && m in 1..12) {
                try {
                    targetDate = LocalDate.of(y, m, d)
                    temporalClass = when {
                        targetDate.isAfter(now.toLocalDate()) -> "future"
                        targetDate.isBefore(now.toLocalDate()) -> "historical"
                        else -> "today"
                    }
                    hasExplicitFutureCue = temporalClass == "future"
                } catch (_: Exception) {}
            }
        }

        // 3. Explicit "14 Sep" / "September 14"
        val namedMonth = Regex("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+([a-z\\u0900-\\u097F]+)(?:\\s+(\\d{4}))?\\b").find(lower)
        if (namedMonth != null) {
            val d = namedMonth.groupValues[1].toIntOrNull()
            val m = MONTHS[namedMonth.groupValues[2]]
            val y = namedMonth.groupValues[3].toIntOrNull() ?: now.year
            if (d != null && m != null && d in 1..31) {
                try {
                    targetDate = LocalDate.of(y, m, d)
                    temporalClass = when {
                        targetDate.isAfter(now.toLocalDate()) -> "future"
                        targetDate.isBefore(now.toLocalDate()) -> "historical"
                        else -> "today"
                    }
                    hasExplicitFutureCue = temporalClass == "future"
                } catch (_: Exception) {}
            }
        }

        // 4. Time extraction ("9:30 am", "5 pm", "10 baje", "shaam", "morning")
        val clockRegex = Regex("\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|baje|बजे)?\\b").find(lower)
        if (clockRegex != null && (clockRegex.groupValues[3].isNotBlank() || clockRegex.groupValues[2].isNotBlank())) {
            val hRaw = clockRegex.groupValues[1].toIntOrNull() ?: 9
            val mRaw = clockRegex.groupValues[2].toIntOrNull() ?: 0
            val suffix = clockRegex.groupValues[3]
            if (hRaw in 0..23 && mRaw in 0..59) {
                hour = when {
                    suffix == "pm" && hRaw < 12 -> hRaw + 12
                    suffix == "am" && hRaw == 12 -> 0
                    (lower.contains("shaam") || lower.contains("evening") || lower.contains("raat")) && hRaw in 1..11 -> hRaw + 12
                    else -> hRaw
                }
                minute = mRaw
                hasExplicitTime = true
            }
        } else {
            when {
                lower.contains("morning") || lower.contains("subah") || lower.contains("सुबह") -> {
                    hour = 9; minute = 0; hasExplicitTime = true
                }
                lower.contains("afternoon") || lower.contains("dopahar") -> {
                    hour = 14; minute = 0; hasExplicitTime = true
                }
                lower.contains("evening") || lower.contains("shaam") || lower.contains("शाम") -> {
                    hour = 18; minute = 0; hasExplicitTime = true
                }
                lower.contains("night") || lower.contains("raat") -> {
                    hour = 20; minute = 30; hasExplicitTime = true
                }
            }
        }

        // 5. Reminder intent detection
        val isReminder = hasExplicitFutureCue || hasExplicitTime ||
            listOf("remind", "reminder", "alarm", "notify", "yaad", "याद", "meeting", "appointment", "due")
                .any { lower.contains(it) }

        if (temporalClass == "today" && !isReminder && lower.length > 180) {
            // Long passive notes without reminder cues default to today unless explicitly historical
        }

        val resolvedDt = targetDate.atTime(hour, minute)
            .atZone(ZoneId.systemDefault())
            .toOffsetDateTime()
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

        val actionItems = extractActionItems(trimmed)
        val checklist = actionItems.mapIndexed { idx, itemText ->
            ChecklistItem(
                id = "${idx + 1}",
                text = itemText,
                completed = false,
                dueDatetime = if (isReminder) resolvedDt else null
            )
        }

        return TemporalExtractionResult(
            temporalClass = temporalClass,
            resolvedDatetime = resolvedDt,
            actionItems = actionItems,
            isHighConfidenceReminder = isReminder,
            checklistItems = checklist
        )
    }

    fun extractActionItems(text: String): List<String> {
        if (text.isBlank()) return emptyList()
        val lines = text.replace("\r\n", "\n").split("\n").map { it.trim() }.filter { it.isNotBlank() }
        val bulletPattern = Regex("^(?:\\(?\\d{1,2}[.)\\]:-]|[•\\-*►✔✓])\\s*")
        val hasBullets = lines.any { bulletPattern.containsMatchIn(it) }

        val items = if (hasBullets) {
            lines.map { it.replace(bulletPattern, "").trim() }.filter { it.length >= 3 }
        } else {
            text.split(Regex("[।!?.]+\\s*|\\n+|\\s+(?:and then|after that|aur phir|uske baad)\\s+", RegexOption.IGNORE_CASE))
                .map { it.trim() }
                .filter { it.length >= 4 }
        }
        return items.ifEmpty { listOf(text.trim()) }.take(20)
    }

    fun parseChecklist(rawJson: String): List<ChecklistItem> {
        if (rawJson.isBlank()) return emptyList()
        return try {
            json.decodeFromString<List<ChecklistItem>>(rawJson)
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun encodeChecklist(items: List<ChecklistItem>): String {
        return json.encodeToString(items)
    }

    fun extractSmartData(text: String): SmartDataSummary {
        if (text.isBlank()) return SmartDataSummary()
        val dates = Regex("\\b\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b|\\b\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{2,4}\\b", RegexOption.IGNORE_CASE)
            .findAll(text).map { it.value }.distinct().take(8).toList()
        val amounts = Regex("(?:₹|Rs\\.?|INR|\\$|USD|EUR)\\s*[0-9,]+(?:\\.\\d{1,2})?", RegexOption.IGNORE_CASE)
            .findAll(text).map { it.value.trim() }.distinct().take(8).toList()
        val phones = Regex("(?:\\+91[\\s-]?)?[6-9]\\d{9}\\b|\\b\\d{3}[\\s-]\\d{3}[\\s-]\\d{4}\\b")
            .findAll(text).map { it.value.trim() }.distinct().take(6).toList()
        val emails = Regex("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}")
            .findAll(text).map { it.value }.distinct().take(6).toList()
        val ids = Regex("\\b[A-Z]{5}\\d{4}[A-Z]\\b|\\b\\d{4}\\s\\d{4}\\s\\d{4}\\b")
            .findAll(text).map { it.value }.distinct().take(6).toList()
        return SmartDataSummary(dates = dates, amounts = amounts, phones = phones, emails = emails, ids = ids)
    }
}
