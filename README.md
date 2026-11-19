# FileSearchPro (Native Android — Kotlin & Jetpack Compose)

**FileSearchPro v2.0.0** is a 100% on-device offline document intelligence, fast multi-page PDF scanner, voice Second Brain, and Smart Cards wallet built natively in **Kotlin**, **Jetpack Compose**, **Material Design 3**, and **Room + KSP**.

---

## Core Architecture & Features

- **Search Hub (`SearchScreen` + `SearchEngine` + `EmbeddingEngine` + `MultilingualEngine`)**
  - Six search modes: *Quick Search* (partial + English→Hindi transliteration & concept expansion), *Natural Language* (384-dim offline bilingual semantic embeddings stored in Room), *Exact Match*, *Whole Word*, *Wildcard*, and *Boolean* (`AND` / `OR` / `NOT`).
  - Automatic startup indexing, delta re-indexing, SAF folder persistence (`OpenDocumentTree`), Photo Picker media indexing, and match highlighting with `Match X of Y` prev/next navigation.
  - Export extracted text cleanly to **TXT**, **Markdown**, **CSV**, or **JSON**.

- **Scans & Docs + Fast Multi-Page PDF Scanner (`DocumentsScreen`, `DocScannerScreen`, `PageOrganizerScreen`, `PdfViewerScreen`, `OcrAndPdfEngine`)**
  - Google **ML Kit Document Scanner** (`GmsDocumentScanning`, up to 50 pages per batch, auto-crop, perspective/shadow cleanup, plus Photo Picker fallback).
  - Concurrent multi-page **ML Kit OCR** (Latin + Devanagari scripts) and **PDFBox-Android** text extraction & PDF building.
  - Full PDF page organization: 3-column page grid, rotate, reorder, extract pages, delete pages, merge PDFs, plus image diagonal watermarks and interactive canvas e-signatures.

- **Voice Second Brain (`SecondBrainScreen`, `VoiceCaptureManager`, `TemporalExtractor`, `ReminderReceiver`)**
  - Offline Android `SpeechRecognizer` capture across 16 languages (English, Hindi, Hinglish, Marathi, Bengali, Telugu, Tamil, Gujarati, Kannada, Punjabi, Spanish, French, German, Japanese, Arabic).
  - Automatic temporal classification (*Today* / *Upcoming* / *History*), action checklist extraction, document cross-linking, image attachment, Awareness Bell, and Morning Daily Digest alarms.

- **Smart Cards Wallet (`CardsScreen`, `CreateCardScreen`, `SmartTaxonomy`)**
  - 6 auto-categorized Smart Folders (*Medical*, *Vehicle*, *Finance*, *Govt IDs*, *Education*, *Personal*), expiry alerts, related cards similarity detection, and **2-in-1 A4 ID Card** front + back compositing.

- **File Manager, Space Cleaner & LAN PC Explorer (`FileManagerScreen`, `FileAnalyserScreen`, `LanHttpServer`, `LanFtpServer`)**
  - App Vault browsing with multi-select Copy/Move/Paste/Delete/Share + embedded HTTP Web Explorer (with ZIP batch download) & RFC 959 FTP Server over local Wi-Fi.
  - Device storage breakdown (`StatFs`), cache cleaner, SHA-256 exact duplicate finder, dHash + Laplacian sharpness burst photo clusterer, and semantic clone detector.

---

## Build & Tech Stack

- **UI**: Jetpack Compose + Material 3 (`AlabasterLightColors` & `TitaniumDarkColors`) + Navigation Compose (`@Serializable` routes)
- **Persistence**: Room (`2.7.1`) + KSP (`2.3.2`) + Jetpack DataStore Preferences
- **Document & Vision**: Google ML Kit Text Recognition (`Latin` + `Devanagari`), ML Kit Document Scanner, PDFBox-Android, Coil
- **Requirements**: Android Studio / Gradle 9.3.1, JDK 17+, `minSdk 26`, `targetSdk 36`

## Known Stubs / Future Work (`TODO`)

- `ToolsViewModel.activateLicense`: Offline format verification (`FL-...`) is active; remote license server validation and Google Play Billing integration remain marked as `TODO`.
