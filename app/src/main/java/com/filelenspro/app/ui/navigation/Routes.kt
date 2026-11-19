package com.filelenspro.app.ui.navigation

import kotlinx.serialization.Serializable

@Serializable
object DocumentsRoute

@Serializable
object SecondBrainRoute

@Serializable
object SearchRoute

@Serializable
object CardsRoute

@Serializable
object SettingsRoute

@Serializable
object FileManagerRoute

@Serializable
object FileAnalyserRoute

@Serializable
data class DocScannerRoute(
    val mode: String = "batch", // "batch" | "single" | "idcard"
    val appendToPdfUri: String? = null
)

@Serializable
data class PageOrganizerRoute(
    val pdfUri: String? = null,
    val fileName: String? = null
)

@Serializable
data class PdfViewerRoute(
    val fileId: Long = -1L,
    val uri: String = "",
    val title: String = "Document"
)

@Serializable
data class CreateCardRoute(
    val fileUri: String = "",
    val fileId: Long = -1L,
    val fileName: String = "",
    val initialTag: String = ""
)

@Serializable
object BookmarksRoute

@Serializable
object SavedSearchesRoute

@Serializable
object LicenseRoute
