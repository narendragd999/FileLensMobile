/**
 * reminderService.ts — Exact Notification & Alarm Scheduling
 *
 * Schedules high-confidence reminders extracted from voice notes
 * on Android using Notifications / AlarmManager.
 */

import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const ALARM_CHANNEL_ID = 'alarms_channel_v2';
export const ALARM_SOUND_NAME = 'reminder_alert.wav';

/**
 * Configure high-priority Alarm notification channel on Android
 * Uses a dedicated 5-second distinctive harmonic alert chime (reminder_alert.wav)
 * and routes audio through the ALARM stream so reminders ring with dedicated volume.
 */
export async function setupAlarmNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      // 1. Clean up legacy channel to avoid stale sound settings
      await Notifications.deleteNotificationChannelAsync('alarms_channel').catch(() => {});

      // 2. Configure dedicated Alarm channel with custom 5-second tone and ALARM audio usage
      await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
        name: 'Alarms & Task Reminders',
        description: 'FileLens task alarms with distinctive 5-second alert chime and dedicated alarm volume stream',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 600, 300, 600, 300, 600],
        sound: ALARM_SOUND_NAME,
        enableLights: true,
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    } catch (e) {
      console.warn('[reminderService] Error setting up alarms channel:', e);
    }
  }
}

// Automatically initialize channel on load
setupAlarmNotificationChannel();

import { requestNotificationPermission } from './notificationPermissionService';

/**
 * Request notification permissions (supporting Android 13+ POST_NOTIFICATIONS)
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  return await requestNotificationPermission();
}

/**
 * Strip stale or conflicting temporal words (e.g. "aaj 2 pm baje", "today at 4pm", "kal 10 baje")
 * from task descriptions so notifications always remain accurate and coherent.
 */
export function cleanReminderTaskText(raw: string): string {
  if (!raw) return '';
  let cleaned = raw;

  // Remove patterns like "aaj", "kal", "parso", "today", "tomorrow"
  cleaned = cleaned.replace(/\b(?:aaj|kal|parso|today|tomorrow)\b/gi, ' ');

  // "2 pm baje", "2:30 pm", "14:00", "2 baje", "at 4 pm", "at 4:00 PM"
  cleaned = cleaned.replace(/(?:\bat\s*)?\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)(?:\s*baje)?\b/gi, ' ');
  cleaned = cleaned.replace(/\b\d{1,2}(?::\d{2})?\s*baje\b/gi, ' ');

  // Dangling prepositions or time adverbs: "ko", "par", "pe", "around", "at"
  cleaned = cleaned.replace(/\b(?:ko|pe|par|around|at)\b/gi, ' ');

  // Collapse consecutive whitespaces and trim punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '');

  if (!cleaned || cleaned.length < 2) {
    return raw.trim();
  }

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Format triggerDate into a standard readable time string
 * e.g., "4:00 PM (Today)", "10:30 AM (Tomorrow)", or "2:00 PM, 25 Sep"
 */
export function formatStandardReminderTime(triggerDate: Date): string {
  const now = new Date();
  const isToday = 
    now.getFullYear() === triggerDate.getFullYear() &&
    now.getMonth() === triggerDate.getMonth() &&
    now.getDate() === triggerDate.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    tomorrow.getFullYear() === triggerDate.getFullYear() &&
    tomorrow.getMonth() === triggerDate.getMonth() &&
    tomorrow.getDate() === triggerDate.getDate();

  const timeStr = triggerDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `${timeStr} (Today)`;
  } else if (isTomorrow) {
    return `${timeStr} (Tomorrow)`;
  } else {
    const dateStr = triggerDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${timeStr}, ${dateStr}`;
  }
}

export interface VoiceNoteReminderOptions {
  actionItems?: Array<{ text: string; completed?: boolean } | string>;
  enableEvePlanningReminder?: boolean;
  evePlanningHour?: number;
  enableTwoHourReminder?: boolean;
  enableFifteenMinReminder?: boolean;
}

/**
 * Schedule smart staged notifications for a voice note / day plan:
 * 1. Stage 1 (Smart Eve Planning Alert): Evening before event at 8:00 PM with clean to-do checklist
 * 2. Stage 2 (T-2h Imminent Alert): 2 hours before event start
 * 3. Stage 3 (T-15m Pre-reminder): 15 minutes before event start
 * 4. Stage 4 (Sharp-time Alarm): Exact scheduled time with high-priority alarm sound
 */
export async function scheduleVoiceNoteReminder(
  noteId: number,
  title: string,
  body: string,
  triggerDate: Date,
  options?: VoiceNoteReminderOptions
): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.warn('[reminderService] Notification permission not granted');
      return null;
    }

    await setupAlarmNotificationChannel();

    // Cancel previous scheduled reminders for this note to prevent duplicates
    await cancelVoiceNoteReminderByNoteId(noteId);

    const now = Date.now();
    const triggerTime = triggerDate.getTime();
    const diffSeconds = Math.floor((triggerTime - now) / 1000);

    // If date is in the past, do not schedule
    if (diffSeconds <= 0) {
      console.warn('[reminderService] Trigger time is in the past:', triggerDate);
      return null;
    }

    const cleanTask = cleanReminderTaskText(title || body || 'Scheduled Task');
    const cleanDetail = cleanReminderTaskText(body || title || cleanTask);
    const timeLabel = formatStandardReminderTime(triggerDate);

    // Extract active to-dos from actionItems (up to 3 items for clean notification display)
    const rawTasks = options?.actionItems || [];
    const tasks = rawTasks
      .map(item => (typeof item === 'string' ? item : item?.text))
      .filter(t => !!t && t.trim().length > 0)
      .map(t => t.trim());
    const activeTasks = tasks.filter(t => !t.startsWith('[DONE] ')).slice(0, 3);
    const taskCount = tasks.length;
    let taskListSummary = '';
    if (activeTasks.length > 0) {
      taskListSummary = activeTasks.map((t, i) => `${i + 1}. ${t}`).join('\n');
    }

    // 1. Stage 1: Smart Eve-of-Event (1-Day-Before) Planning Alert
    // Fires at 8:00 PM the evening before the event (ideal for evening planning and preparing files/tasks)
    const enableEve = options?.enableEvePlanningReminder !== false;
    const targetEveHour = options?.evePlanningHour ?? 20; // 8:00 PM

    if (enableEve) {
      const eveDate = new Date(triggerDate);
      eveDate.setDate(eveDate.getDate() - 1);
      eveDate.setHours(targetEveHour, 0, 0, 0);

      let eveTriggerTime = eveDate.getTime();
      let shouldScheduleEve = false;

      if (eveTriggerTime > now + 60000) {
        // Normal case: Eve 8:00 PM is in the future
        shouldScheduleEve = true;
      } else if (triggerTime - now > 2 * 3600 * 1000) {
        // Event is tomorrow or upcoming, but was created today after 8:00 PM
        const currentHour = new Date().getHours();
        if (currentHour >= 20 && currentHour < 23) {
          // Late evening creation: schedule preparation notification in 5 minutes
          eveTriggerTime = now + (5 * 60 * 1000);
          shouldScheduleEve = true;
        } else if (currentHour >= 23 || currentHour < 6) {
          // Midnight / early morning creation: schedule morning briefing at 7:00 AM
          const morningDate = new Date(triggerDate);
          morningDate.setHours(7, 0, 0, 0);
          if (morningDate.getTime() > now + 60000 && triggerTime - morningDate.getTime() >= 45 * 60 * 1000) {
            eveTriggerTime = morningDate.getTime();
            shouldScheduleEve = true;
          }
        }
      }

      if (shouldScheduleEve) {
        try {
          const eveTitle = activeTasks.length > 0
            ? `📅 Tomorrow's Preparation: ${cleanTask}`
            : `📅 Tomorrow: ${cleanTask}`;

          const eveBody = activeTasks.length > 0
            ? `Scheduled tomorrow at ${timeLabel}.\nTasks to prepare (${taskCount}):\n${taskListSummary}\nTap to view & plan ahead!`
            : `Scheduled for tomorrow at ${timeLabel} • ${cleanDetail}. Plan ahead!`;

          await Notifications.scheduleNotificationAsync({
            content: {
              title: eveTitle,
              body: eveBody,
              data: {
                noteId,
                stage: 'eve',
                isEvePlanningReminder: true,
                taskCount,
                url: 'filelenspro://second-brain',
              },
              sound: ALARM_SOUND_NAME,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(eveTriggerTime),
              channelId: ALARM_CHANNEL_ID,
            },
          });
        } catch (eveErr) {
          console.warn('[reminderService] Failed to schedule Smart Eve reminder:', eveErr);
        }
      }
    }

    // 2. Stage 2: T-2h Imminent Event Reminder (if event is > 2 hours away)
    if (options?.enableTwoHourReminder !== false) {
      const twoHourReminderTime = triggerTime - (2 * 60 * 60 * 1000);
      if (twoHourReminderTime > now + 60000) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `⏳ In 2 Hours: ${cleanTask}`,
              body: `Starts at ${timeLabel} • ${cleanDetail}. Get ready!`,
              data: { noteId, stage: 'imminent', url: 'filelenspro://second-brain' },
              sound: ALARM_SOUND_NAME,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(twoHourReminderTime),
              channelId: ALARM_CHANNEL_ID,
            },
          });
        } catch (twoErr) {
          console.warn('[reminderService] Failed to schedule T-2h imminent reminder:', twoErr);
        }
      }
    }

    // 3. Stage 3: 15-minute advance pre-reminder
    if (options?.enableFifteenMinReminder !== false) {
      const preReminderTime = triggerTime - (15 * 60 * 1000);
      if (preReminderTime > now + 30000) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `⏳ In 15 Mins: ${cleanTask}`,
              body: `Starts at ${timeLabel} • ${cleanDetail}. Tap to prepare!`,
              data: { noteId, stage: 'pre', isPreReminder: true, url: 'filelenspro://second-brain' },
              sound: ALARM_SOUND_NAME,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(preReminderTime),
              channelId: ALARM_CHANNEL_ID,
            },
          });
        } catch (preErr) {
          console.warn('[reminderService] Failed to schedule 15m pre-reminder:', preErr);
        }
      }
    }

    // 4. Stage 4: Sharp-time alarm notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🔔 Plan Reminder: ${cleanTask}`,
        body: `Scheduled for ${timeLabel} • ${cleanDetail}. Tap to view details.`,
        data: { noteId, stage: 'sharp', url: 'filelenspro://second-brain' },
        sound: ALARM_SOUND_NAME,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: ALARM_CHANNEL_ID,
      },
    });

    return notificationId;
  } catch (e) {
    console.warn('[reminderService] Failed to schedule reminder:', e);
    return null;
  }
}

/**
 * Schedule an advance and exact reminder for an individual to-do task item
 */
export async function scheduleTaskReminder(
  noteId: number,
  taskId: string,
  taskText: string,
  dueDatetime: Date | string,
  options?: { enableEvePlanningReminder?: boolean }
): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;
    await setupAlarmNotificationChannel();

    const triggerDate = typeof dueDatetime === 'string' ? new Date(dueDatetime) : dueDatetime;
    const triggerTime = triggerDate.getTime();
    const now = Date.now();

    if (triggerTime <= now) return null;

    const timeLabel = formatStandardReminderTime(triggerDate);
    const cleanTask = cleanReminderTaskText(taskText);

    // Cancel previous reminders for this specific task
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const data = notif.content?.data as any;
      if (data && data.taskId === taskId) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    // 1. Smart Eve 8:00 PM reminder if task is due tomorrow or later
    if (options?.enableEvePlanningReminder !== false) {
      const eveDate = new Date(triggerDate);
      eveDate.setDate(eveDate.getDate() - 1);
      eveDate.setHours(20, 0, 0, 0);
      const eveTime = eveDate.getTime();

      if (eveTime > now + 60000) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `📅 Tomorrow's Task: ${cleanTask}`,
            body: `Due tomorrow at ${timeLabel}. Plan and prepare ahead!`,
            data: { noteId, taskId, stage: 'eve', url: 'filelenspro://second-brain' },
            sound: ALARM_SOUND_NAME,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(eveTime),
            channelId: ALARM_CHANNEL_ID,
          },
        });
      }
    }

    // 2. Exact due time reminder
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Task Due: ${cleanTask}`,
        body: `Due at ${timeLabel}. Tap to complete in Second Brain.`,
        data: { noteId, taskId, stage: 'sharp', url: 'filelenspro://second-brain' },
        sound: ALARM_SOUND_NAME,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: ALARM_CHANNEL_ID,
      },
    });

    return notifId;
  } catch (e) {
    console.warn('[reminderService] scheduleTaskReminder failed:', e);
    return null;
  }
}


/**
 * Set an exact native Android Clock Alarm (Google Clock / Samsung Clock)
 * This rings the physical clock alarm on the phone with full ringing screen, snooze, and dismiss.
 */
export async function setDeviceClockAlarm(
  title: string,
  triggerDate: Date
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const hours = triggerDate.getHours();
    const minutes = triggerDate.getMinutes();

    await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
      extra: {
        'android.intent.extra.alarm.HOUR': hours,
        'android.intent.extra.alarm.MINUTES': minutes,
        'android.intent.extra.alarm.MESSAGE': title || 'FileLensPro Task',
        'android.intent.extra.alarm.SKIP_UI': false,
      },
    });
    return true;
  } catch (e) {
    console.warn('[reminderService] Failed to set device clock alarm:', e);
    return false;
  }
}

export interface CalendarEventOptions {
  title: string;
  triggerDate: Date;
  description?: string;
  location?: string;
  allDay?: boolean;
}

/**
 * Open native Android Calendar to add a date-specific reminder event with alarm.
 * Pre-fills title, begin/end times, full description/checklist, and reminder alarm.
 */
export async function openDeviceCalendarEvent(
  titleOrOptions: string | CalendarEventOptions,
  triggerDateParam?: Date,
  descriptionParam?: string
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    let title = 'FileLensPro Task';
    let triggerDate = new Date();
    let description = '';
    let location = 'FileLensPro';
    let allDay = false;

    if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
      title = titleOrOptions.title || title;
      triggerDate = titleOrOptions.triggerDate || triggerDate;
      description = titleOrOptions.description || '';
      location = titleOrOptions.location || location;
      allDay = !!titleOrOptions.allDay;
    } else {
      title = titleOrOptions || title;
      triggerDate = triggerDateParam || triggerDate;
      description = descriptionParam || '';
    }

    const beginTime = triggerDate.getTime();
    const endTime = allDay ? beginTime + (24 * 60 * 60 * 1000) : beginTime + (60 * 60 * 1000);

    const extras: Record<string, any> = {
      'title': title,
      'beginTime': beginTime,
      'endTime': endTime,
      'hasAlarm': 1,
    };

    if (description) {
      extras['description'] = description;
    }
    if (location) {
      extras['eventLocation'] = location;
    }
    if (allDay) {
      extras['allDay'] = true;
    }

    await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
      data: 'content://com.android.calendar/events',
      extra: extras,
    });
    return true;
  } catch (e) {
    console.warn('[reminderService] Failed to open calendar event:', e);
    return false;
  }
}

/**
 * Cancel a scheduled reminder
 */
export async function cancelVoiceNoteReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('[reminderService] Failed to cancel reminder:', e);
  }
}

/**
 * Cancel any scheduled reminders associated with a specific voice note ID
 */
export async function cancelVoiceNoteReminderByNoteId(noteId: number): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const data = notif.content?.data as any;
      if (data && (data.noteId === noteId || data.voiceNoteId === noteId)) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (e) {
    console.warn('[reminderService] cancelVoiceNoteReminderByNoteId failed:', e);
  }
}

/**
 * Schedule ongoing / recurring awareness bell notifications for today's and upcoming day plans.
 * This rings alarm/bell notifications periodically so the user stays aware of their day plans and commitments.
 */
export async function scheduleDayPlanAwarenessReminders(todayCount: number = 0, upcomingCount: number = 0): Promise<boolean> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return false;

    await setupAlarmNotificationChannel();

    // Cancel previous awareness notifications to prevent duplicates
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of all) {
      if (notif.content?.data?.isAwarenessReminder) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    if (todayCount === 0 && upcomingCount === 0) {
      return true;
    }

    // 1. Schedule Today's plan awareness notification (repeats every 4 hours with alarm sound)
    if (todayCount > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🔔 Today's Plan Reminder",
          body: `You have ${todayCount} active task${todayCount > 1 ? 's' : ''} in your Day Plan for today. Tap to check them off!`,
          data: { isAwarenessReminder: true, url: 'filelenspro://second-brain' },
          sound: ALARM_SOUND_NAME,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 4 * 3600,
          repeats: true,
          channelId: ALARM_CHANNEL_ID,
        },
      });
    }

    // 2. Schedule Upcoming plan awareness notification (repeats every 8 hours)
    if (upcomingCount > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "📅 Upcoming Plans Awareness",
          body: `You have ${upcomingCount} upcoming scheduled plan${upcomingCount > 1 ? 's' : ''}. Stay prepared!`,
          data: { isAwarenessReminder: true, url: 'filelenspro://second-brain' },
          sound: ALARM_SOUND_NAME,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 8 * 3600,
          repeats: true,
          channelId: ALARM_CHANNEL_ID,
        },
      });

      // 3. Schedule Daily 8:00 PM Evening Planning Briefing for Tomorrow
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🌙 Tomorrow's Preparation & Agenda",
          body: `You have ${upcomingCount} upcoming scheduled plan${upcomingCount > 1 ? 's' : ''}. Check your to-do checklist to prepare ahead!`,
          data: { isAwarenessReminder: true, isDailyEveningBriefing: true, url: 'filelenspro://second-brain' },
          sound: ALARM_SOUND_NAME,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 20,
          minute: 0,
          channelId: ALARM_CHANNEL_ID,
        },
      });
    }

    return true;
  } catch (e) {
    console.warn('[reminderService] scheduleDayPlanAwarenessReminders failed:', e);
    return false;
  }
}

/**
 * Check whether day plan awareness bell reminders are currently active.
 */
export async function isDayPlanAwarenessActive(): Promise<boolean> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.some(n => n.content?.data?.isAwarenessReminder === true);
  } catch {
    return false;
  }
}

/**
 * Schedules an automated daily morning digest notification at 8:00 AM.
 * Briefs the user with active tasks and commitments for the day.
 */
export async function scheduleMorningDailyDigest(
  hour: number = 8,
  minute: number = 0,
  taskCount: number = 0
): Promise<boolean> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return false;

    await setupAlarmNotificationChannel();

    // Cancel existing morning digest to avoid duplicate triggers
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of all) {
      if (notif.content?.data?.isMorningDigest) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    const body = taskCount > 0
      ? `Good morning! You have ${taskCount} scheduled task${taskCount > 1 ? 's' : ''} in today's plan. Tap to start your day!`
      : `Good morning! Your Second Brain is ready. Tap to record your plans and capture voice notes.`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '☀️ Daily Morning Briefing',
        body,
        data: { isMorningDigest: true, url: 'filelenspro://second-brain' },
        sound: ALARM_SOUND_NAME,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: ALARM_CHANNEL_ID,
      },
    });

    return true;
  } catch (e) {
    console.warn('[reminderService] Failed to schedule morning daily digest:', e);
    return false;
  }
}

/**
 * Check if morning daily digest is currently scheduled
 */
export async function isMorningDailyDigestActive(): Promise<boolean> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.some(n => n.content?.data?.isMorningDigest === true);
  } catch {
    return false;
  }
}

/**
 * Cancel morning daily digest
 */
export async function cancelMorningDailyDigest(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of all) {
      if (notif.content?.data?.isMorningDigest) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (e) {
    console.warn('[reminderService] Failed to cancel morning digest:', e);
  }
}

/**
 * Triggers a test notification (in 1 second) with the 5-second distinctive alarm chime
 * on the dedicated Android Alarm volume stream.
 */
export async function testAlertNotification(): Promise<boolean> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return false;

    await setupAlarmNotificationChannel();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 FileLens Reminder Tone Test',
        body: 'Playing 5-second distinctive harmonic chime on Alarm volume stream...',
        data: { isTestTone: true, url: 'filelenspro://second-brain' },
        sound: ALARM_SOUND_NAME,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId: ALARM_CHANNEL_ID,
      },
    });

    return true;
  } catch (e) {
    console.warn('[reminderService] testAlertNotification failed:', e);
    return false;
  }
}



