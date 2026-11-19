package com.filelenspro.app

import com.filelenspro.app.domain.engine.RecurrenceHelper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class RecurrenceHelperTest {

    @Test
    fun advancesDailyWeeklyMonthlyYearlyCorrectly() {
        val now = LocalDateTime.of(2026, 6, 10, 9, 0)
        val base = "2026-06-10 09:00"

        assertNull(RecurrenceHelper.computeNextOccurrenceIso(base, RecurrenceHelper.NONE, now))
        assertEquals("2026-06-11 09:00", RecurrenceHelper.computeNextOccurrenceIso(base, RecurrenceHelper.DAILY, now))
        assertEquals("2026-06-17 09:00", RecurrenceHelper.computeNextOccurrenceIso(base, RecurrenceHelper.WEEKLY, now))
        assertEquals("2026-07-10 09:00", RecurrenceHelper.computeNextOccurrenceIso(base, RecurrenceHelper.MONTHLY, now))
        assertEquals("2027-06-10 09:00", RecurrenceHelper.computeNextOccurrenceIso(base, RecurrenceHelper.YEARLY, now))
    }

    @Test
    fun catchesUpOverdueRecurringRemindersIntoTheFuture() {
        val now = LocalDateTime.of(2026, 6, 10, 14, 30)
        // Old monthly bill from March 15 should roll forward to June 15 (next future occurrence)
        val next = RecurrenceHelper.computeNextOccurrenceIso("2026-03-15 10:00", RecurrenceHelper.MONTHLY, now)
        assertEquals("2026-06-15 10:00", next)
    }

    @Test
    fun normalizesAndLabelsRecurrenceRules() {
        assertEquals(RecurrenceHelper.MONTHLY, RecurrenceHelper.normalize("  MONTHLY "))
        assertEquals(RecurrenceHelper.NONE, RecurrenceHelper.normalize("unknown"))
        assertFalse(RecurrenceHelper.isRecurring(null))
        assertFalse(RecurrenceHelper.isRecurring("none"))
        assertTrue(RecurrenceHelper.isRecurring("weekly"))
        assertEquals("Weekly", RecurrenceHelper.shortLabelFor("weekly"))
    }
}
