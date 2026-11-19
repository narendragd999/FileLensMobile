package com.filelenspro.app.domain.engine

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

object RecurrenceHelper {

    const val NONE = "none"
    const val DAILY = "daily"
    const val WEEKLY = "weekly"
    const val MONTHLY = "monthly"
    const val YEARLY = "yearly"

    val ALL_RULES = listOf(NONE, DAILY, WEEKLY, MONTHLY, YEARLY)

    private val SPACE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    fun normalize(rule: String?): String = when (rule?.trim()?.lowercase()) {
        DAILY -> DAILY
        WEEKLY -> WEEKLY
        MONTHLY -> MONTHLY
        YEARLY -> YEARLY
        else -> NONE
    }

    fun labelFor(rule: String?): String = when (normalize(rule)) {
        DAILY -> "Daily"
        WEEKLY -> "Weekly"
        MONTHLY -> "Monthly"
        YEARLY -> "Yearly"
        else -> "No Repeat"
    }

    fun shortLabelFor(rule: String?): String = when (normalize(rule)) {
        DAILY -> "Daily"
        WEEKLY -> "Weekly"
        MONTHLY -> "Monthly"
        YEARLY -> "Yearly"
        else -> "Once"
    }

    fun isRecurring(rule: String?): Boolean = normalize(rule) != NONE

    fun parseDateTime(iso: String?): LocalDateTime? {
        if (iso.isNullOrBlank()) return null
        val cleaned = iso.trim().replace("T", " ").take(16)
        return runCatching { LocalDateTime.parse(cleaned, SPACE_FMT) }.getOrNull()
            ?: runCatching { LocalDate.parse(cleaned.take(10)).atTime(9, 0) }.getOrNull()
    }

    fun formatDateTime(dt: LocalDateTime): String = dt.format(SPACE_FMT)

    /**
     * Advances [currentIso] by one interval of [rule].
     * If the advanced time is still in the past relative to [referenceNow], advances until it is in the future.
     * Returns null when rule is [NONE].
     */
    fun computeNextOccurrenceIso(
        currentIso: String?,
        rule: String?,
        referenceNow: LocalDateTime = LocalDateTime.now()
    ): String? {
        val norm = normalize(rule)
        if (norm == NONE) return null
        var next = parseDateTime(currentIso) ?: referenceNow.withSecond(0).withNano(0)
        var guard = 0
        do {
            next = when (norm) {
                DAILY -> next.plusDays(1)
                WEEKLY -> next.plusWeeks(1)
                MONTHLY -> next.plusMonths(1)
                YEARLY -> next.plusYears(1)
                else -> return null
            }
            guard++
        } while (!next.isAfter(referenceNow) && guard < 120)
        return formatDateTime(next)
    }

    fun temporalClassFor(iso: String?, today: LocalDate = LocalDate.now()): String {
        val dt = parseDateTime(iso) ?: return "historical"
        val d = dt.toLocalDate()
        return when {
            d.isEqual(today) -> "today"
            d.isAfter(today) -> "future"
            else -> "today"
        }
    }
}
