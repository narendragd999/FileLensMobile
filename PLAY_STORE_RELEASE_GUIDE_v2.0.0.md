# FileLens Pro v2.0.0 — Complete Google Play Store Release & Update Guide

This guide contains everything required to successfully publish **FileLens Pro Version 2.0.0 (Version Code 3)** on the **Google Play Console**.

---

## 1. Release Deliverables & Pre-Flight Status

| Deliverable | Location | Size | Target / Specifications |
| :--- | :--- | :--- | :--- |
| **Google Play App Bundle (AAB)** | `release_v2.0.0/FileLensPro-v2.0.0-release.aab` | **57.80 MB** | `versionCode=3`, `versionName="2.0.0"`, Target SDK 36, 64-bit |
| **Direct Standalone APK** | `release_v2.0.0/FileLensPro-v2.0.0-release.apk` | **88.97 MB** | Signature Scheme v2 Signed via `my-upload-key.keystore` |
| **Feature Graphic** | `play_store_assets/feature_graphic/feature_graphic_1024x500.png` | **111 KB** | Exactly `1024 × 500 px`, 24-bit RGB (No alpha) |
| **High-Res App Icon** | `play_store_assets/icon/app_icon_512x512.png` | **261 KB** | Exactly `512 × 512 px`, 32-bit RGBA |
| **Phone Screenshots (8)** | `play_store_assets/screenshots/phone/*.png` | **~100 KB ea** | Exactly `1080 × 2400 px` (9:20 aspect ratio) |

---

## 2. Generated Promotional Screenshots Showcase

All 8 screenshots are rendered at **1080 × 2400 px** and ready in `play_store_assets/screenshots/phone/`:

1. **`01_offline_search.png`**: *Search Millions of Words in Seconds* — Showcases FTS5 instant search bar, `0.04s` speed indicator, filter chips, and live OCR match highlights.
2. **`02_pdf_scanner.png`**: *Pro Document & PDF Scanner* — Showcases high-res document scanning viewfinder with green perspective crop handles, document edge auto-detection, filter pills, and multi-page thumbnail organizer.
3. **`03_second_brain.png`**: *Your Offline Second Brain* — Showcases audio waveform voice notes, auto-extracted checklists (`Call CA regarding GST`), temporal tags (`Today`, `Future`), and cross-linked PDF document badges.
4. **`04_file_manager.png`**: *Powerful Offline File Manager* — Showcases internal storage + SD card browser, folder navigation breadcrumbs, custom color tags, and floating batch operations toolbar.
5. **`05_storage_analyser.png`**: *Deep Storage Analyser & Cleaner* — Showcases storage breakdown diagnostics bar, 1-tap `Clean Hidden Cache` card, and Meaning Clones with `Select All / None` button.
6. **`06_smart_cards.png`**: *Smart Cards & Identity Wallet* — Showcases offline identity cards (Aadhaar, PAN, Auto Insurance, Warranty Cards) with instant OCR extraction and tag filtering.
7. **`07_pc_explorer.png`**: *Cable-Free PC Explorer* — Showcases local Wi-Fi / hotspot HTTP & FTP server address (`http://192.168.1.15:8080`), connection pulse, and high-speed transfer progress bars.
8. **`08_offline_privacy.png`**: *Zero Cloud. 100% Offline Privacy.* — Showcases certified on-device engine shield emblem, 4 privacy pillars (MiniLM ONNX, Local OCR, Hardware KeyStore, Zero Trackers), and Play Store compliance badge.

---

## 3. Step-by-Step Play Console Update Procedure

### Step 1: Create the New Release in Production Track
1. Log in to [Google Play Console](https://play.google.com/console).
2. Select your app: **FileLens Pro**.
3. In the left navigation menu, expand **Release** and click **Production**.
4. In the top right corner, click **Create new release**.

### Step 2: Upload the App Bundle
1. In the **App bundles** upload area, click **Upload**.
2. Select the signed AAB:
   `c:\Users\admin\Documents\Antigravity\FileLensProComplete\release_v2.0.0\FileLensPro-v2.0.0-release.aab`
3. Wait for the upload and validation to complete. Google Play will confirm:
   - *Version Code: 3*
   - *Version Name: 2.0.0*
   - *Target SDK: 36 (Android 14/15+)*

### Step 3: Enter Release Name & Release Notes
In **Release name**, enter:
`2.0.0 (3)`

In **Release notes**, paste the following text:

```text
🚀 Major Feature Release — FileLens Pro 2.0!

📄 1. PDF Scanner & Document Studio (Scan & Docs)
• High-resolution camera scanner with automatic edge detection and perspective correction.
• Multi-page document scanning, instant PDF export, and page organizer (reorder, rotate, delete).
• 100% on-device OCR extracts printed and handwritten text in seconds.

🧠 2. Second Brain & Temporal Planner
• Offline voice notes and automatic task/action-item checklist extraction.
• Intelligent temporal classification (Today, Future Reminders, Historical Notes).
• Cross-link any PDF document, invoice, or Smart Card directly to your notes.

📁 3. Full-Featured File Manager
• Explore internal storage, SD cards, and USB OTG with blazing speed.
• Create folders, rename, batch copy/move, search, and manage files seamlessly.
• Tag management and quick file preview for PDFs, Office docs, images, and audio.

🧹 4. File Analyser & Storage Cleaner
• Deep storage diagnostics: Identify space hogs, hidden app cache, and junk files.
• Exact byte-by-byte SHA-256 duplicate file detection and burst photo grouping.
• "Meaning Clones" with 1-tap Select All / None to free gigabytes in seconds.

🗂️ 5. Smart Cards & Identity Wallet
• Keep IDs, bills, warranties, and insurance cards organized with instant offline OCR.

🌐 6. Local PC Explorer & Hotspot Sharing
• Fast cable-free file transfer between your phone and PC over local Wi-Fi.

🛡️ 100% On-Device Privacy Guarantee: Zero cloud tracking. No files or data ever leave your phone.
```

---

## 4. Updating Store Listing Graphics & Descriptions

In the left menu, navigate to **Grow &rarr; Store presence &rarr; Main store listing**.

### A. Graphics Uploads:
1. **App icon (512 × 512 px)**:
   - Upload from: `play_store_assets/icon/app_icon_512x512.png`
2. **Feature graphic (1024 × 500 px)**:
   - Upload from: `play_store_assets/feature_graphic/feature_graphic_1024x500.png`
3. **Phone screenshots (8 images — 1080 × 2400 or 1080 × 2460)**:
   - Delete any older screenshots.
   - Recommended framed mockups: Upload all 8 files from `play_store_assets/real_device_screenshots/framed/` in numerical order (01 through 08).
   - Alternatively: Upload raw captures from `play_store_assets/real_device_screenshots/raw/`.
4. **7-inch tablet screenshots (8 images — 1200 × 1920)**:
   - Expand the **7-inch tablet screenshots** section.
   - Upload all 8 files from `play_store_assets/screenshots/tablet_7in/`.
5. **10-inch tablet screenshots (8 images — 1536 × 2048 / 2048 × 1536)**:
   - Expand the **10-inch tablet screenshots** section.
   - Upload all 8 files from `play_store_assets/screenshots/tablet_10in/`.

### B. Store Listing Descriptions:
- **Short description (Under 80 characters)**:
  `All-in-one PDF Scanner, File Manager, Second Brain, Storage Cleaner & Offline AI.`

- **Full description**:
```text
FileLens Pro is your all-in-one offline productivity powerhouse — combining a pro-grade PDF Document Scanner, intelligent Second Brain planner, complete File Manager, and deep Storage Analyser & Cleaner into a single, lightning-fast app with 100% privacy.

🔥 CORE FEATURES:

📸 PDF SCANNER & DOCUMENT STUDIO
• Instant multi-page camera document scanning with auto-edge detection and perspective warping.
• Enhance scans with document filters (Color, B&W, Grayscale, High-Contrast).
• Reorder, rotate, split, and merge PDF pages with the built-in Page Organizer.
• Offline OCR: Turn paper documents, bills, and receipts into searchable text.

🧠 SECOND BRAIN & SMART PLANNER
• Capture fleeting thoughts with fast offline Voice Notes.
• Automatic action-item extraction: Turns your voice into an organized checklist.
• Temporal classification organizes your notes into Today, Future Reminders, and Archive.
• Cross-link any PDF or scanned card directly into your notes.

📂 FULL FILE MANAGER
• Clean, modern directory browser with SD card and USB drive support.
• Full file operations: Rename, copy, move, delete, zip, and organize with custom tags.
• Built-in high-speed viewer for PDFs, DOCX, XLSX, images, and audio files.

🧹 STORAGE ANALYSER & CACHE CLEANER
• Visual storage breakdown: Find hidden storage hogs taking up precious space.
• Exact SHA-256 byte-for-byte duplicate finder and burst photo clusterer.
• Meaning Clones with Select All / None to free gigabytes in seconds.
• Clean temporary junk and system cache safely.

🗂️ SMART CARDS WALLET
• Organize ID cards, medical records, warranties, and receipts with instant tag filtering.

🌐 LOCAL PC EXPLORER (CABLE-FREE TRANSFER)
• Access and transfer files between your phone and your PC browser over local Wi-Fi or mobile hotspot. No cables, no third-party cloud.

🛡️ ZERO CLOUD. 100% OFFLINE PRIVACY.
All AI, OCR, vector embeddings (MiniLM), and file operations run 100% locally on your phone hardware. Zero tracking, zero ads, zero data collection.
```

---

## 5. Google Play Policy & Declaration Compliance

### 1. All Files Access Permission (`MANAGE_EXTERNAL_STORAGE`)
- In Google Play Console under **Policy and programs &rarr; App content &rarr; All files access permission**:
- **Core feature category**: Select **File management & storage optimization**.
- **Written Justification**:
  ```text
  FileLens Pro is a comprehensive Document Management, File Manager, and Storage Analyser app. The MANAGE_EXTERNAL_STORAGE permission is critical for:
  1. Browsing and managing documents across internal and external storage (SD cards, USB OTG).
  2. The Storage Analyser and Cleaner, which performs deep directory scans to locate exact SHA-256 duplicate files, hidden system caches, and oversized files.
  3. Offline indexing and OCR text extraction of PDFs and receipts across user-selected folders.
  All processing occurs 100% on-device with zero cloud collection.
  ```
- **Demonstration Video**: Provide an unlisted YouTube video (30–60 seconds) showing:
  1. Browsing folders in the File Manager.
  2. Opening the File Analyser & Cleaner, scanning for duplicates, and using Select All to delete a duplicate.
  3. Opening the Document Scanner and saving a PDF to device storage.

### 2. Data Safety Form Answers
- In Play Console under **Policy and programs &rarr; App content &rarr; Data safety**:
  - *Does your app collect or share any user data?* &rarr; **No**.
  - All OCR, vector embeddings (all-MiniLM-L6-v2), and document texts stay in the local private SQLite sandbox.
  - No analytics SDKs, advertising trackers, or telemetry libraries are present.

### 3. Advertising ID Declaration
- Under **App content &rarr; Advertising ID**:
  - *Does your app use advertising ID?* &rarr; **No**.

---

## 6. Staged Rollout Strategy (Recommended)

1. When submitting the release, you can choose:
   - **Full Rollout (100%)**: App is pushed to all users immediately upon review approval.
   - **Staged Rollout (20% &rarr; 50% &rarr; 100%)**: Recommended for major updates. Roll out to 20% of users first, check Play Console **Crash Rate & ANR (Android Vitals)** for 24 hours, then increase to 100%.

---

## 7. Direct File Links for Quick Access

- [Google Play App Bundle (AAB)](file:///c:/Users/admin/Documents/Antigravity/FileLensProComplete/release_v2.0.0/FileLensPro-v2.0.0-release.aab)
- [Standalone Release APK](file:///c:/Users/admin/Documents/Antigravity/FileLensProComplete/release_v2.0.0/FileLensPro-v2.0.0-release.apk)
- [Phone Screenshots Folder](file:///c:/Users/admin/Documents/Antigravity/FileLensProComplete/play_store_assets/screenshots/phone)
- [Feature Graphic Image](file:///c:/Users/admin/Documents/Antigravity/FileLensProComplete/play_store_assets/feature_graphic/feature_graphic_1024x500.png)
- [High-Res App Icon](file:///c:/Users/admin/Documents/Antigravity/FileLensProComplete/play_store_assets/icon/app_icon_512x512.png)
