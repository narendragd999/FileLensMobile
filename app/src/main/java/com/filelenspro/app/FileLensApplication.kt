package com.filelenspro.app

import android.app.Application
import com.filelenspro.app.data.db.FileLensDatabase
import com.filelenspro.app.data.prefs.AppPreferences
import com.filelenspro.app.service.DocumentIndexer
import com.filelenspro.app.service.LanFtpServer
import com.filelenspro.app.service.LanHttpServer
import com.filelenspro.app.service.OcrAndPdfEngine
import com.filelenspro.app.service.StorageAnalyzer
import com.filelenspro.app.service.VoiceCaptureManager
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader

class FileLensApplication : Application() {

    lateinit var database: FileLensDatabase
        private set
    lateinit var preferences: AppPreferences
        private set
    lateinit var ocrAndPdfEngine: OcrAndPdfEngine
        private set
    lateinit var documentIndexer: DocumentIndexer
        private set
    lateinit var storageAnalyzer: StorageAnalyzer
        private set
    lateinit var voiceCaptureManager: VoiceCaptureManager
        private set
    lateinit var lanHttpServer: LanHttpServer
        private set
    lateinit var lanFtpServer: LanFtpServer
        private set

    override fun onCreate() {
        super.onCreate()
        PDFBoxResourceLoader.init(applicationContext)
        database = FileLensDatabase.getInstance(this)
        preferences = AppPreferences(this)
        ocrAndPdfEngine = OcrAndPdfEngine(this)
        documentIndexer = DocumentIndexer(this, database.dao(), ocrAndPdfEngine)
        storageAnalyzer = StorageAnalyzer(this, ocrAndPdfEngine)
        voiceCaptureManager = VoiceCaptureManager(this)
        lanHttpServer = LanHttpServer(this)
        lanFtpServer = LanFtpServer(this)
    }
}
