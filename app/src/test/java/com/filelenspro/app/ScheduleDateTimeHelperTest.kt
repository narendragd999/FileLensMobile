package com.filelenspro.app

import com.filelenspro.app.ui.components.ScheduleDateTimeHelper
import com.filelenspro.app.ui.components.SmartToastClassifier
import com.filelenspro.app.ui.components.SmartToastType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

class ScheduleDateTimeHelperTest {

    @Test
    fun utcMidnightRoundtripPreservesExactCalendarDate() {
        val dates = listOf(
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 11, 18),
            LocalDate.of(2028, 2, 29),
            LocalDate.of(2026, 12, 31)
        )
        dates.forEach { d ->
            val millis = ScheduleDateTimeHelper.localDateToUtcMidnightMillis(d)
            val back = ScheduleDateTimeHelper.utcMidnightMillisToLocalDate(millis)
            assertEquals("DatePicker UTC roundtrip must preserve exact date", d, back)
        }
    }

    @Test
    fun classifiesTemporalBucketFromSelectedCalendarDate() {
        val today = LocalDate.of(2026, 11, 18)
        assertEquals("today", ScheduleDateTimeHelper.classifyTemporalFromDate(today, today))
        assertEquals("future", ScheduleDateTimeHelper.classifyTemporalFromDate(today.plusDays(1), today))
        assertEquals("historical", ScheduleDateTimeHelper.classifyTemporalFromDate(today.minusDays(2), today))
    }

    @Test
    fun formatsAndParsesIsoOffsetDateTimeRoundtrip() {
        val zone = ZoneId.of("America/Los_Angeles")
        val date = LocalDate.of(2026, 11, 25)
        val time = LocalTime.of(14, 45)
        val iso = ScheduleDateTimeHelper.toIsoOffsetString(date, time, zone)
        // Must parse cleanly with OffsetDateTime (used by ReminderScheduler)
        val parsedOffset = OffsetDateTime.parse(iso)
        assertEquals(date, parsedOffset.toLocalDate())
        assertEquals(time, parsedOffset.toLocalTime())

        val parsedLocal = ScheduleDateTimeHelper.parseInitialLocalDateTime(iso, zone)
        assertEquals(date, parsedLocal.toLocalDate())
        assertEquals(time, parsedLocal.toLocalTime())
    }

    @Test
    fun friendlyLabelsAndScheduleToastsWorkCleanly() {
        val today = LocalDate.of(2026, 11, 18)
        assertTrue(ScheduleDateTimeHelper.formatFriendlyDate(today, today).startsWith("Today"))
        assertTrue(ScheduleDateTimeHelper.formatFriendlyDate(today.plusDays(1), today).startsWith("Tomorrow"))
        assertEquals(SmartToastType.SUCCESS, SmartToastClassifier.classify("Scheduled for Nov 19, 10:30 AM"))
        assertEquals(SmartToastType.SUCCESS, SmartToastClassifier.classify("Rescheduled \"Doctor Visit\" to Nov 20, 5:00 PM"))
    }
}
