# FileLens Mobile — Installation & Setup Guide

**Expo Go compatible** — no native build needed for testing.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | Download from https://nodejs.org/ |
| **Expo Go app** | Install on your phone from App Store / Play Store |
| **Wi-Fi network** | Phone + computer must be on the same network |
| **No Android Studio needed** | Expo Go handles everything |
| **No Xcode needed** | Expo Go handles everything |
| **No NDK needed** | tesseract.js runs in a WebView — no native code |

---

## Step 1: Install Node.js

### Windows
1. Download Node.js 20 LTS from https://nodejs.org/
2. Run installer with default options
3. Verify: `node --version` should print `v20.x.x`

### macOS
```bash
brew install node@20
```

### Linux
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Step 2: Get the Source Code

```bash
# Unzip the project
unzip FileLens_Mobile_Expo.zip
cd filelens_mobile

# Install dependencies
npm install

# Fix any version mismatches (auto-resolves to compatible SDK 54 versions)
npx expo install --fix
```

**If you get an error about `expo-pdf` or other missing packages:**
- Run `npx expo install --fix` — this automatically resolves all dependency versions
- If a specific package is still missing, delete it from `package.json` and re-run

---

## Step 3: Add App Icons (Optional for Testing)

Create two PNG files in the `assets/` directory:
- `icon.png` — 1024×1024 (app icon)
- `adaptive-icon.png` — 1024×1024 (Android adaptive icon)

For testing, you can skip this — Expo Go uses a default icon.

---

## Step 4: Start the Dev Server

```bash
npx expo start
```

This launches the Metro bundler and shows a QR code in your terminal:

```
› Metro waiting on exp://192.168.1.100:8081
› Scan this QR code with Expo Go to open the app:

    [QR CODE]

› Press ? to show help
› Press r to reload the app
› Press j to open debugger
› Press m to toggle menu
```

---

## Step 5: Open on Your Phone

### iOS (iPhone)
1. Open the **Camera app**
2. Point it at the QR code on your computer screen
3. Tap the notification that appears → opens in Expo Go
4. FileLens loads!

### Android
1. Open the **Expo Go** app
2. Tap **"Scan QR code"**
3. Scan the QR code on your computer screen
4. FileLens loads!

---

## Step 6: Test the Features

### Search
1. Open the **Search** tab
2. Type any word → results appear as you type
3. Tap column headers (Name, Size, Modified) to sort

### OCR
1. Open the **OCR Upload** tab
2. Tap **"Add Files"** → pick a photo containing text
3. Tap **"OCR All"** — the first OCR call takes 10-15s (downloads tesseract.js + traineddata)
4. Subsequent OCR calls take 2-5s per image
5. Tap the file → see extracted text
6. Type a word in the search box → see highlights
7. Use ◀ ▶ to navigate between matches

### Hindi OCR
1. Make sure language is set to "English + Hindi" in the OCR Upload toolbar
2. Upload an image with Hindi text
3. OCR extracts Devanagari text correctly

### Transliteration
1. In the OCR Upload search box, type English: `ram singh`
2. Tap the **✨ Hindi** button
3. Text becomes `राम सिंह` and matches are highlighted

### Duplicates
1. Open the **Duplicates** tab
2. Tap **"Scan for Duplicates"**
3. Review duplicate groups, select + delete

### License (Desktop Pro Users)
1. Open **Settings** → tap **"Activate / Check License"**
2. Note your Machine ID
3. Enter your existing desktop FileLens license key
4. Tap **"Activate"** — same key works on both devices

---

## Troubleshooting

### "Unable to load tesseract.js"
- **Cause:** No internet on first OCR (tesseract.js loads from CDN)
- **Fix:** Connect to Wi-Fi, retry. After first load, it's cached.

### "OCR timeout (120s)"
- **Cause:** Image is too large (>15MB) or WebView crashed
- **Fix:** Use a smaller image, or restart the app

### App doesn't load after scanning QR code
- **Cause:** Phone + computer not on same Wi-Fi, or firewall blocking port 8081
- **Fix:**
  - Make sure both devices are on the same Wi-Fi (not a guest network)
  - Disable Windows Firewall temporarily
  - Or use a tunnel: `npx expo start --tunnel` (works across networks)

### "Module not found" errors
- **Fix:** Run `npx expo install --fix` to resolve version mismatches

### OCR is slow
- **Expected:** 2-5s per image on mid-range phones, 1-2s on flagships
- **Budget phones (₹8K):** May take 5-10s — acceptable for batch OCR
- The first OCR call is always slower (tesseract.js + traineddata download)

---

## Building for Production (Optional)

When ready to publish to Play Store / App Store:

### Android (Play Store AAB)
```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Configure
eas build:configure

# Build production AAB
eas build --platform android --profile production
```

### iOS (App Store)
```bash
# Requires Apple Developer Program ($99/year)
eas build --platform ios --profile production
```

The production build:
- Bundles tesseract.js WASM core as an asset (no CDN dependency)
- Bundles eng + hin traineddata as assets (no download on first launch)
- Produces an AAB (Android) / IPA (iOS) ready for store submission

---

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Fix version mismatches
npx expo install --fix

# Start dev server (shows QR code)
npx expo start

# Start with tunnel (works across networks)
npx expo start --tunnel

# Start on Android emulator (if installed)
npx expo start --android

# Start on iOS simulator (if installed, macOS only)
npx expo start --ios

# Clear cache + restart
npx expo start -c

# Type check
npx tsc --noEmit
```
