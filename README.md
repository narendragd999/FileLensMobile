# FileLens Mobile

**Smart file search + OCR for Android & iOS** — built with Expo SDK 54 + React Native.

**✅ Works with Expo Go** — no custom native module needed. Test instantly on your phone via Expo Go.

## How OCR Works (Expo Go Compatible)

This app uses **tesseract.js** (the WebAssembly port of Tesseract 5) running inside a **hidden WebView**. This approach:

- ✅ Works in Expo Go (no native code, no custom dev client)
- ✅ Same Tesseract engine as desktop FileLens (same traineddata, same results)
- ✅ Supports Hindi (Devanagari) OCR
- ✅ Works on iOS + Android from one codebase
- ✅ No build step needed for testing — just `npx expo start`

The trade-off: OCR runs in the WebView's JS thread (slightly slower than native C++), but for typical images (2-5s per image) this is perfectly usable.

---

## Quick Start (Expo Go)

```bash
# 1. Install dependencies
npm install

# 2. Fix version mismatches (Expo SDK 54)
npx expo install --fix

# 3. Start the dev server
npx expo start

# 4. Open on your phone:
#    - Install "Expo Go" from the App Store / Play Store
#    - Scan the QR code with your camera
#    - The app loads instantly — no build needed!
```

**That's it.** No Android Studio, no Xcode, no NDK, no 15-minute native builds. Just `npx expo start` and scan the QR code.

---

## Features (Full Desktop Parity)

- **File name + content search** (SQLite FTS5)
- **OCR images** (PNG, JPG, BMP, GIF, TIFF, WebP) — English + Hindi
- **OCR Upload window** — upload any image, OCR it, search inside extracted text
- **Highlight + arrow navigation** through all search matches
- **English → Hindi transliteration** (Google Input Tools + offline fallback)
- **Sortable results** (name, size, modified, type, score)
- **Duplicate finder** (SHA-256 checksum-based)
- **Bookmarks + saved searches**
- **Export** results as CSV/JSON/TXT (share sheet)
- **Cross-platform license** — desktop Pro users enter their SAME key on mobile

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  React Native UI (Expo Router — 5 tabs)              │
│  Search • OCR Upload • Duplicates • Bookmarks • Settings│
└─────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────┐
│  TypeScript Services (Zustand state)                 │
│  ocrService • searchEngine • highlighter               │
│  transliterator • database • duplicateFinder           │
│  licenseService • exporter • bookmarksService          │
└─────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────┐
│  Hidden WebView (tesseract.js v6)                   │
│  Loads tesseract.js from CDN on first OCR             │
│  Downloads eng+hin traineddata automatically           │
│  Communicates via postMessage / injectJavaScript     │
└─────────────────────────────────────────────────────┘
```

---

## Cross-Platform License Auto-Activation

Desktop FileLens Pro users can use the **same license key** on mobile:
1. User buys FileLens for desktop (₹199) → receives key `FL-42-XXXX-XXXX-XXXX-XXXX`
2. User installs FileLens Mobile → Settings → License
3. Enters the SAME key
4. Backend validates + binds to mobile device (up to 2 devices per key)
5. Mobile app is permanently activated

---

## File Structure

```
filelens_mobile/
├── app.json                          # Expo config (SDK 54)
├── package.json                      # Dependencies
├── babel.config.js                   # Babel + module resolver
├── metro.config.js                   # Metro config
├── tsconfig.json                     # TypeScript config
├── README.md
├── INSTALLATION_GUIDE.md             # Complete setup guide
├── TESSERACT_ANALYSIS.md             # Tesseract vs ML Kit analysis
├── assets/                           # App icons (add your own)
└── src/
    ├── app/                          # Expo Router screens (5 tabs)
    │   ├── _layout.tsx               # Tab navigator + hidden OcrWebView
    │   ├── index.tsx                 # Search screen
    │   ├── ocr.tsx                   # OCR Upload screen
    │   ├── duplicates.tsx            # Duplicate finder
    │   ├── bookmarks.tsx             # Bookmarks list
    │   ├── settings.tsx              # Settings
    │   └── license.tsx               # License activation
    ├── components/
    │   └── OcrWebView.tsx            # Hidden WebView running tesseract.js
    ├── services/
    │   ├── ocrService.ts             # Tesseract.js wrapper (WebView-based)
    │   ├── searchEngine.ts           # FTS5 search + scoring
    │   ├── highlighter.ts            # Match finder + navigation
    │   ├── transliterator.ts         # English → Hindi
    │   ├── database.ts               # SQLite + FTS5 schema
    │   ├── tessdataManager.ts        # Traineddata (no-op, tesseract.js handles)
    │   ├── duplicateFinder.ts        # SHA-256 duplicate detection
    │   ├── bookmarksService.ts       # Bookmarks + saved searches
    │   ├── exporter.ts               # CSV/JSON export
    │   ├── indexerService.ts         # MediaStore indexing
    │   ├── licenseService.ts         # Cross-platform activation
    │   ├── contentExtractor.ts       # PDF/DOCX/TXT extraction
    │   └── pdfOcrService.ts          # PDF OCR (Phase 2)
    ├── store/
    │   └── useStore.ts                # Zustand global state
    ├── models/
    │   └── types.ts                  # TypeScript types
    └── utils/
        ├── constants.ts              # Extensions, presets
        └── format.ts                 # Size/date formatters
```

---

## Testing the App

### Prerequisites
- **Expo Go** installed on your phone (from App Store / Play Store)
- Phone and computer on the **same Wi-Fi network**

### Steps
1. `npm install`
2. `npx expo install --fix` (resolves any version mismatches)
3. `npx expo start`
4. Open the Camera app (iPhone) or Expo Go app (Android)
5. Scan the QR code
6. FileLens loads on your phone!

### What happens on first OCR:
1. The hidden WebView loads tesseract.js from CDN (~2MB, one-time)
2. When you OCR an image, tesseract.js downloads `eng.traineddata` (2MB) + `hin.traineddata` (1MB) from CDN
3. These are cached in the WebView's browser cache — subsequent OCR is instant
4. OCR takes 2-5 seconds per image on mid-range phones

---

## Building for Production (Play Store / App Store)

When you're ready to ship, you need a production build (not Expo Go):

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Build for Android (AAB for Play Store)
eas build --platform android --profile production

# Build for iOS (requires Apple Developer account)
eas build --platform ios --profile production
```

The production build includes everything bundled — no CDN dependency. The tesseract.js WASM core and traineddata are bundled as assets.

---

## License

- **App code**: Proprietary (© 2026 FileLens)
- **tesseract.js**: Apache 2.0 (https://github.com/naptha/tesseract.js)
- **Tesseract engine**: Apache 2.0

---

## Support

- Email: filelenspro@gmail.com
- Website: narendragd999.github.io/FileLensWeb
