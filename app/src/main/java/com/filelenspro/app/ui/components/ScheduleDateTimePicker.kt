package com.filelenspro.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Keyboard
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.filelenspro.app.ui.theme.LocalFileLensColors
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

object ScheduleDateTimeHelper {
    private val DATE_FMT = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.getDefault())
    private val SHORT_DATE_FMT = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
    private val TIME_FMT = DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())

    fun parseInitialLocalDateTime(
        isoString: String?,
        zoneId: ZoneId = ZoneId.systemDefault()
    ): LocalDateTime {
        if (!isoString.isNullOrBlank()) {
            runCatching {
                return OffsetDateTime.parse(isoString).atZoneSameInstant(zoneId).toLocalDateTime()
            }
            runCatching {
                return Instant.parse(isoString).atZone(zoneId).toLocalDateTime()
            }
            runCatching {
                return LocalDateTime.parse(isoString)
            }
            runCatching {
                return LocalDate.parse(isoString.take(10)).atTime(9, 0)
            }
        }
        val now = LocalDateTime.now(zoneId)
        return now.plusHours(1).withMinute(0).withSecond(0).withNano(0)
    }

    fun classifyTemporalFromDate(
        date: LocalDate,
        today: LocalDate = LocalDate.now()
    ): String {
        return when {
            date.isBefore(today) -> "historical"
            date.isAfter(today) -> "future"
            else -> "today"
        }
    }

    fun toIsoOffsetString(
        date: LocalDate,
        time: LocalTime,
        zoneId: ZoneId = ZoneId.systemDefault()
    ): String {
        return date.atTime(time)
            .atZone(zoneId)
            .toOffsetDateTime()
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
    }

    /** Material 3 DatePicker operates strictly on UTC midnight timestamps. */
    fun localDateToUtcMidnightMillis(date: LocalDate): Long {
        return date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    }

    fun utcMidnightMillisToLocalDate(millis: Long): LocalDate {
        return Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
    }

    fun formatFriendlyDate(date: LocalDate, today: LocalDate = LocalDate.now()): String {
        return when (date) {
            today -> "Today · ${date.format(SHORT_DATE_FMT)}"
            today.plusDays(1) -> "Tomorrow · ${date.format(SHORT_DATE_FMT)}"
            today.minusDays(1) -> "Yesterday · ${date.format(SHORT_DATE_FMT)}"
            else -> date.format(DATE_FMT)
        }
    }

    fun formatFriendlyTime(time: LocalTime): String = time.format(TIME_FMT)
}

/**
 * Reusable Material 3 Calendar Date + Clock Time manual selector with 1-tap quick presets.
 * Used for both new Second Brain task scheduling and rescheduling existing tasks.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleDateTimeSection(
    selectedDate: LocalDate,
    selectedTime: LocalTime,
    onDateTimeChanged: (LocalDate, LocalTime) -> Unit,
    modifier: Modifier = Modifier,
    recurrenceRule: String = com.filelenspro.app.domain.engine.RecurrenceHelper.NONE,
    onRecurrenceChanged: ((String) -> Unit)? = null
) {
    val palette = LocalFileLensColors.current
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }

    val temporalLabel = when (ScheduleDateTimeHelper.classifyTemporalFromDate(selectedDate)) {
        "today" -> "TODAY"
        "future" -> "UPCOMING"
        else -> "HISTORY"
    }
    val temporalColor = when (temporalLabel) {
        "TODAY" -> palette.accent
        "UPCOMING" -> palette.purpleAccent
        else -> palette.muted
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Schedule Date & Time",
                style = MaterialTheme.typography.labelLarge,
                color = palette.muted,
                fontWeight = FontWeight.SemiBold
            )
            Surface(
                color = temporalColor.copy(alpha = 0.14f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    text = temporalLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = temporalColor,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                )
            }
        }

        // Side-by-side Calendar Date Tile + Clock Time Tile
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                color = palette.surface2,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .weight(1.25f)
                    .border(1.dp, palette.accent.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { showDatePicker = true }
                    .testTag("schedule_pick_date_btn")
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        Icons.Rounded.CalendarMonth,
                        contentDescription = "Select Date",
                        tint = palette.accent,
                        modifier = Modifier.size(20.dp)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Date",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.muted
                        )
                        Text(
                            text = ScheduleDateTimeHelper.formatFriendlyDate(selectedDate),
                            style = MaterialTheme.typography.labelLarge,
                            color = palette.text,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            Surface(
                color = palette.surface2,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .weight(0.95f)
                    .border(1.dp, palette.purpleAccent.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { showTimePicker = true }
                    .testTag("schedule_pick_time_btn")
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        Icons.Rounded.Schedule,
                        contentDescription = "Select Time",
                        tint = palette.purpleAccent,
                        modifier = Modifier.size(20.dp)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Time",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.muted
                        )
                        Text(
                            text = ScheduleDateTimeHelper.formatFriendlyTime(selectedTime),
                            style = MaterialTheme.typography.labelLarge,
                            color = palette.text,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }

        // Fast 1-Tap Quick Schedule Presets
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            val nowDt = LocalDateTime.now()
            val in1Hr = nowDt.plusHours(1).withSecond(0).withNano(0)
            val todayEve = LocalDate.now().atTime(18, 0)
            val tmrwMorning = LocalDate.now().plusDays(1).atTime(9, 0)
            val nextWeek = LocalDate.now().plusDays(7).atTime(9, 0)

            listOf(
                "In 1 hr" to (in1Hr.toLocalDate() to in1Hr.toLocalTime()),
                "Today 6 PM" to (todayEve.toLocalDate() to todayEve.toLocalTime()),
                "Tomorrow 9 AM" to (tmrwMorning.toLocalDate() to tmrwMorning.toLocalTime()),
                "Next Week" to (nextWeek.toLocalDate() to nextWeek.toLocalTime())
            ).forEach { (label, pair) ->
                AssistChip(
                    onClick = { onDateTimeChanged(pair.first, pair.second) },
                    label = { Text(label, style = MaterialTheme.typography.labelSmall) }
                )
            }
        }

        if (onRecurrenceChanged != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    Icons.Rounded.Repeat,
                    contentDescription = "Repeat Schedule",
                    tint = palette.accent,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    "Repeat",
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.muted,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                com.filelenspro.app.domain.engine.RecurrenceHelper.ALL_RULES.forEach { rule ->
                    FilterChip(
                        selected = com.filelenspro.app.domain.engine.RecurrenceHelper.normalize(recurrenceRule) == rule,
                        onClick = { onRecurrenceChanged(rule) },
                        label = {
                            Text(
                                com.filelenspro.app.domain.engine.RecurrenceHelper.labelFor(rule),
                                style = MaterialTheme.typography.labelSmall
                            )
                        },
                        modifier = Modifier.testTag("recurrence_chip_$rule")
                    )
                }
            }
        }
    }

    // Material 3 Full Interactive Monthly Calendar DatePickerDialog
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = ScheduleDateTimeHelper.localDateToUtcMidnightMillis(selectedDate)
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                Button(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            val pickedDate = ScheduleDateTimeHelper.utcMidnightMillisToLocalDate(millis)
                            onDateTimeChanged(pickedDate, selectedTime)
                        }
                        showDatePicker = false
                    },
                    modifier = Modifier.testTag("calendar_date_confirm_btn")
                ) {
                    Text("Set Date")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
            }
        ) {
            DatePicker(
                state = datePickerState,
                showModeToggle = true
            )
        }
    }

    // Material 3 Interactive Clock / Keyboard TimePicker Dialog
    if (showTimePicker) {
        val timePickerState = rememberTimePickerState(
            initialHour = selectedTime.hour,
            initialMinute = selectedTime.minute,
            is24Hour = false
        )
        var useKeyboardInput by remember { mutableStateOf(false) }

        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            containerColor = palette.surface,
            title = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Select Time", color = palette.text, fontWeight = FontWeight.Bold)
                    IconButton(
                        onClick = { useKeyboardInput = !useKeyboardInput },
                        modifier = Modifier.size(44.dp).testTag("time_picker_mode_toggle")
                    ) {
                        Icon(
                            if (useKeyboardInput) Icons.Rounded.AccessTime else Icons.Rounded.Keyboard,
                            contentDescription = if (useKeyboardInput) "Switch to Clock Dial" else "Switch to Keyboard Input",
                            tint = palette.accent
                        )
                    }
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (useKeyboardInput) {
                        TimeInput(state = timePickerState)
                    } else {
                        TimePicker(state = timePickerState)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val pickedTime = LocalTime.of(timePickerState.hour, timePickerState.minute)
                        onDateTimeChanged(selectedDate, pickedTime)
                        showTimePicker = false
                    },
                    modifier = Modifier.testTag("calendar_time_confirm_btn")
                ) {
                    Text("Set Time")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false }) { Text("Cancel") }
            }
        )
    }
}

/**
 * Standalone Calendar Date Filter Dialog for jumping to any specific date in Second Brain.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarDateFilterDialog(
    currentIsoDate: String?,
    onDismiss: () -> Unit,
    onSelectDate: (LocalDate) -> Unit
) {
    val initialDate = remember(currentIsoDate) {
        runCatching {
            if (!currentIsoDate.isNullOrBlank()) LocalDate.parse(currentIsoDate.take(10)) else LocalDate.now()
        }.getOrElse { LocalDate.now() }
    }
    val datePickerState = rememberDatePickerState(
        initialSelectedDateMillis = ScheduleDateTimeHelper.localDateToUtcMidnightMillis(initialDate)
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(
                onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        onSelectDate(ScheduleDateTimeHelper.utcMidnightMillisToLocalDate(millis))
                    }
                    onDismiss()
                },
                modifier = Modifier.testTag("filter_calendar_confirm_btn")
            ) {
                Text("Filter Date")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    ) {
        DatePicker(state = datePickerState, showModeToggle = true)
    }
}
