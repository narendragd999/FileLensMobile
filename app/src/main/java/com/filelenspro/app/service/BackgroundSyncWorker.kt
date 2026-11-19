package com.filelenspro.app.service

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.util.StoragePermissionHelper
import com.filelenspro.app.widget.FileSearchWidgetProvider
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

class BackgroundSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? FileLensApplication ?: return Result.failure()
        return try {
            val prefs = app.preferences.prefsFlow.first()
            if (StoragePermissionHelper.hasAllFilesAccess(applicationContext)) {
                app.documentIndexer.indexEntireDevice(
                    ocrLanguage = prefs.ocrLanguage,
                    forceReindex = false
                )
            } else {
                app.documentIndexer.syncAndReindexAll(prefs.ocrLanguage)
            }
            app.preferences.recordBackgroundSyncTimestamp(System.currentTimeMillis())
            FileSearchWidgetProvider.requestRefresh(applicationContext)
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}

object BackgroundSyncScheduler {
    private const val UNIQUE_WORK_NAME = "filesearchpro_incremental_auto_sync"

    fun configure(context: Context, enabled: Boolean, chargingOnly: Boolean) {
        val wm = WorkManager.getInstance(context)
        if (!enabled) {
            wm.cancelUniqueWork(UNIQUE_WORK_NAME)
            return
        }
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .setRequiresCharging(chargingOnly)
            .build()

        val request = PeriodicWorkRequestBuilder<BackgroundSyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()

        wm.enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }
}
