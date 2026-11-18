package expo.modules.pdftoimage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class FileLensBackgroundService : Service() {

    companion object {
        const val CHANNEL_ID = "filelens_background_ocr_channel"
        const val NOTIFICATION_ID = 90210
        const val ACTION_START = "ACTION_START"
        const val ACTION_UPDATE = "ACTION_UPDATE"
        const val ACTION_STOP = "ACTION_STOP"
        const val EXTRA_TITLE = "EXTRA_TITLE"
        const val EXTRA_MESSAGE = "EXTRA_MESSAGE"

        private var wakeLock: PowerManager.WakeLock? = null
        @Volatile
        var isRunning: Boolean = false

        fun start(context: Context, title: String = "FileLensPro", message: String = "Indexing and OCR in progress...") {
            try {
                val intent = Intent(context, FileLensBackgroundService::class.java).apply {
                    action = ACTION_START
                    putExtra(EXTRA_TITLE, title)
                    putExtra(EXTRA_MESSAGE, message)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun update(context: Context, title: String = "FileLensPro", message: String, progress: Int = -1, max: Int = -1) {
            try {
                // Directly update the notification manager so updates work reliably in background on Android 8+ through Android 15
                // without throwing BackgroundServiceStartNotAllowedException
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                if (manager != null) {
                    createNotificationChannel(context)
                    val notification = buildNotification(context, title, message, progress, max)
                    manager.notify(NOTIFICATION_ID, notification)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun stop(context: Context) {
            try {
                val intent = Intent(context, FileLensBackgroundService::class.java).apply {
                    action = ACTION_STOP
                }
                context.startService(intent)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    val channel = NotificationChannel(
                        CHANNEL_ID,
                        "FileLens Background Indexing and OCR",
                        NotificationManager.IMPORTANCE_LOW
                    ).apply {
                        description = "Shows progress of file indexing and OCR text extraction"
                        setShowBadge(false)
                        enableVibration(false)
                        setSound(null, null)
                    }
                    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                    manager?.createNotificationChannel(channel)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        fun buildNotification(context: Context, title: String, message: String, progress: Int = -1, max: Int = -1): Notification {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pendingIntent = if (launchIntent != null) {
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
                PendingIntent.getActivity(context, 0, launchIntent, flags)
            } else null

            val iconResId = context.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.stat_notify_sync

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(iconResId)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

            if (max > 0 && progress >= 0) {
                builder.setProgress(max, progress, false)
            } else if (progress == -2) {
                builder.setProgress(0, 0, true)
            }

            if (pendingIntent != null) {
                builder.setContentIntent(pendingIntent)
            }

            return builder.build()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel(this)
        acquireWakeLock()
        try {
            val notification = buildNotification(this, "FileLensPro", "Indexing and OCR in progress...")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "FileLensPro"
        val message = intent?.getStringExtra(EXTRA_MESSAGE) ?: "Processing files and OCR in background..."

        when (action) {
            ACTION_STOP -> {
                isRunning = false
                releaseWakeLock()
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        stopForeground(STOP_FOREGROUND_REMOVE)
                    } else {
                        stopForeground(true)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val notification = buildNotification(this, title, message)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(
                            NOTIFICATION_ID,
                            notification,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                        )
                    } else {
                        startForeground(NOTIFICATION_ID, notification)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            ACTION_UPDATE -> {
                try {
                    val notification = buildNotification(this, title, message)
                    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                    manager?.notify(NOTIFICATION_ID, notification)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        releaseWakeLock()
        super.onDestroy()
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = powerManager?.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "FileLensPro::BackgroundOcrWakeLock"
                )?.apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire(60 * 60 * 1000L)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
