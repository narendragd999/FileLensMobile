package com.filelenspro.app.service

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.MainActivity
import com.filelenspro.app.domain.engine.RecurrenceHelper
import com.filelenspro.app.widget.FileSearchWidgetProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "FileSearchPro Second Brain"
        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: "You have a scheduled action item."
        val notifId = intent.getIntExtra(EXTRA_NOTIF_ID, (System.currentTimeMillis() % Int.MAX_VALUE).toInt())
        val noteId = intent.getLongExtra(EXTRA_NOTE_ID, -1L)
        val recurrence = intent.getStringExtra(EXTRA_RECURRENCE) ?: RecurrenceHelper.NONE

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Second Brain Reminders",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Scheduled reminders, recurring bill alerts, and daily planning"
        }
        manager.createNotificationChannel(channel)

        val openIntent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("filelenspro://brain")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            notifId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val donePi = buildActionIntent(context, ReminderActionReceiver.ACTION_MARK_DONE, notifId, noteId, title, message, recurrence, 1)
        val snooze15Pi = buildActionIntent(context, ReminderActionReceiver.ACTION_SNOOZE_15M, notifId, noteId, title, message, recurrence, 2)
        val tomorrowPi = buildActionIntent(context, ReminderActionReceiver.ACTION_TOMORROW_9AM, notifId, noteId, title, message, recurrence, 3)

        val repeatBadge = if (RecurrenceHelper.isRecurring(recurrence)) " · Repeats ${RecurrenceHelper.shortLabelFor(recurrence)}" else ""

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(message + repeatBadge)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message + repeatBadge))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(contentIntent)
            .addAction(android.R.drawable.checkbox_on_background, "Mark Done", donePi)
            .addAction(android.R.drawable.ic_lock_idle_alarm, "Snooze 15m", snooze15Pi)
            .addAction(android.R.drawable.ic_menu_today, "Tomorrow 9 AM", tomorrowPi)
            .build()

        manager.notify(notifId, notification)
    }

    private fun buildActionIntent(
        context: Context,
        action: String,
        notifId: Int,
        noteId: Long,
        title: String,
        message: String,
        recurrence: String,
        salt: Int
    ): PendingIntent {
        val i = Intent(context, ReminderActionReceiver::class.java).apply {
            this.action = action
            putExtra(EXTRA_NOTIF_ID, notifId)
            putExtra(EXTRA_NOTE_ID, noteId)
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_MESSAGE, message)
            putExtra(EXTRA_RECURRENCE, recurrence)
        }
        return PendingIntent.getBroadcast(
            context,
            notifId * 10 + salt,
            i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val CHANNEL_ID = "filelens_brain_reminders"
        const val EXTRA_TITLE = "title"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_NOTIF_ID = "notifId"
        const val EXTRA_NOTE_ID = "noteId"
        const val EXTRA_RECURRENCE = "recurrence"
    }
}

class ReminderActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val notifId = intent.getIntExtra(ReminderReceiver.EXTRA_NOTIF_ID, 0)
        val noteId = intent.getLongExtra(ReminderReceiver.EXTRA_NOTE_ID, -1L)
        val title = intent.getStringExtra(ReminderReceiver.EXTRA_TITLE) ?: "Second Brain Task"
        val message = intent.getStringExtra(ReminderReceiver.EXTRA_MESSAGE) ?: ""
        val recurrence = intent.getStringExtra(ReminderReceiver.EXTRA_RECURRENCE) ?: RecurrenceHelper.NONE

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(notifId)

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as? FileLensApplication
                val dao = app?.database?.dao()
                val note = if (noteId > 0L) dao?.getVoiceNoteById(noteId) else null

                when (action) {
                    ACTION_MARK_DONE -> {
                        if (note != null && dao != null) {
                            val effectiveRule = RecurrenceHelper.normalize(note.recurrenceRule)
                            if (RecurrenceHelper.isRecurring(effectiveRule)) {
                                val nextIso = RecurrenceHelper.computeNextOccurrenceIso(note.resolvedDatetime, effectiveRule)
                                val nextClass = RecurrenceHelper.temporalClassFor(nextIso)
                                dao.updateVoiceNote(
                                    note.copy(
                                        resolvedDatetime = nextIso,
                                        temporalClass = nextClass,
                                        isReminderSet = true
                                    )
                                )
                                val nextDt = RecurrenceHelper.parseDateTime(nextIso)
                                if (nextDt != null) {
                                    val triggerMs = nextDt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                                    ReminderScheduler.scheduleNotification(
                                        context = context,
                                        id = note.id.toInt(),
                                        triggerAtMillis = triggerMs,
                                        title = note.title.ifBlank { title },
                                        message = note.rawTranscript.take(120),
                                        noteId = note.id,
                                        recurrenceRule = effectiveRule
                                    )
                                }
                            } else {
                                dao.updateVoiceNote(
                                    note.copy(
                                        temporalClass = "historical",
                                        isReminderSet = false
                                    )
                                )
                            }
                        }
                    }

                    ACTION_SNOOZE_15M -> {
                        val snoozeDt = LocalDateTime.now().plusMinutes(15).withSecond(0).withNano(0)
                        val triggerMs = snoozeDt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                        val iso = RecurrenceHelper.formatDateTime(snoozeDt)
                        if (note != null && dao != null) {
                            dao.updateVoiceNote(
                                note.copy(
                                    resolvedDatetime = iso,
                                    temporalClass = RecurrenceHelper.temporalClassFor(iso),
                                    isReminderSet = true
                                )
                            )
                        }
                        ReminderScheduler.scheduleNotification(
                            context = context,
                            id = notifId,
                            triggerAtMillis = triggerMs,
                            title = title,
                            message = message,
                            noteId = noteId,
                            recurrenceRule = recurrence
                        )
                    }

                    ACTION_TOMORROW_9AM -> {
                        val tomorrowDt = LocalDate.now().plusDays(1).atTime(9, 0)
                        val triggerMs = tomorrowDt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                        val iso = RecurrenceHelper.formatDateTime(tomorrowDt)
                        if (note != null && dao != null) {
                            dao.updateVoiceNote(
                                note.copy(
                                    resolvedDatetime = iso,
                                    temporalClass = "future",
                                    isReminderSet = true
                                )
                            )
                        }
                        ReminderScheduler.scheduleNotification(
                            context = context,
                            id = notifId,
                            triggerAtMillis = triggerMs,
                            title = title,
                            message = message,
                            noteId = noteId,
                            recurrenceRule = recurrence
                        )
                    }
                }
                FileSearchWidgetProvider.requestRefresh(context)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_MARK_DONE = "com.filelenspro.app.ACTION_MARK_DONE"
        const val ACTION_SNOOZE_15M = "com.filelenspro.app.ACTION_SNOOZE_15M"
        const val ACTION_TOMORROW_9AM = "com.filelenspro.app.ACTION_TOMORROW_9AM"
    }
}

object ReminderScheduler {
    fun scheduleNotification(
        context: Context,
        id: Int,
        triggerAtMillis: Long,
        title: String,
        message: String,
        noteId: Long = -1L,
        recurrenceRule: String = RecurrenceHelper.NONE
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(ReminderReceiver.EXTRA_TITLE, title)
            putExtra(ReminderReceiver.EXTRA_MESSAGE, message)
            putExtra(ReminderReceiver.EXTRA_NOTIF_ID, id)
            putExtra(ReminderReceiver.EXTRA_NOTE_ID, noteId)
            putExtra(ReminderReceiver.EXTRA_RECURRENCE, recurrenceRule)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val safeTime = triggerAtMillis.coerceAtLeast(System.currentTimeMillis() + 3_000L)
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, safeTime, pi)
    }

    fun cancelNotification(context: Context, id: Int) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(context, ReminderReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pi != null) alarmManager.cancel(pi)
    }
}
