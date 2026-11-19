package com.filelenspro.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.filelenspro.app.FileLensApplication
import com.filelenspro.app.MainActivity
import com.filelenspro.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class FileSearchWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val app = context.applicationContext as? FileLensApplication
                val dao = app?.database?.dao()
                val docsCount = dao?.getAllFiles()?.size ?: 0
                val todayTasks = dao?.getVoiceNotesByTemporalClass("today")?.size ?: 0
                val statsText = "$docsCount docs · $todayTasks today"

                appWidgetIds.forEach { widgetId ->
                    val views = buildViews(context, statsText)
                    appWidgetManager.updateAppWidget(widgetId, views)
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun buildViews(context: Context, statsText: String): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_filesearch)
        views.setTextViewText(R.id.widget_stats, statsText)

        views.setOnClickPendingIntent(
            R.id.widget_search_bar,
            deepLinkPendingIntent(context, "filelenspro://search", 701)
        )
        views.setOnClickPendingIntent(
            R.id.widget_btn_scan,
            deepLinkPendingIntent(context, "filelenspro://scan", 702)
        )
        views.setOnClickPendingIntent(
            R.id.widget_btn_brain,
            deepLinkPendingIntent(context, "filelenspro://brain_schedule", 703)
        )
        return views
    }

    private fun deepLinkPendingIntent(context: Context, uri: String, reqCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(uri)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context,
            reqCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        fun requestRefresh(context: Context) {
            runCatching {
                val manager = AppWidgetManager.getInstance(context)
                val component = ComponentName(context, FileSearchWidgetProvider::class.java)
                val ids = manager.getAppWidgetIds(component)
                if (ids.isNotEmpty()) {
                    val intent = Intent(context, FileSearchWidgetProvider::class.java).apply {
                        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    }
                    context.sendBroadcast(intent)
                }
            }
        }
    }
}
