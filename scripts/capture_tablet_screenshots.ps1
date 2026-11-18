# capture_tablet_screenshots.ps1 — Captures real 7-inch and 10-inch tablet screenshots via USB debugging
$ErrorActionPreference = "Stop"

$adb = "c:\Users\admin\Documents\Antigravity\platform-tools-latest-windows\platform-tools\adb.exe"
$baseDir = "c:\Users\admin\Documents\Antigravity\FileLensProComplete\play_store_assets\screenshots"
$dir7in = "$baseDir\tablet_7in"
$dir10in = "$baseDir\tablet_10in"

if (-not (Test-Path $dir7in)) { New-Item -ItemType Directory -Path $dir7in -Force | Out-Null }
if (-not (Test-Path $dir10in)) { New-Item -ItemType Directory -Path $dir10in -Force | Out-Null }

function Capture-Tab($remoteName, $destDir, $localName) {
    Write-Host "Capturing $localName to $destDir..."
    & $adb shell screencap -p "/sdcard/$remoteName"
    & $adb pull "/sdcard/$remoteName" "$destDir\$localName"
    & $adb shell rm "/sdcard/$remoteName"
}

try {
    # ==========================================
    # PART 1: 7-INCH TABLET SCREENSHOTS (1200x1920)
    # ==========================================
    Write-Host "`n=== SWITCHING TO 7-INCH TABLET MODE (1200x1920, 280 dpi) ==="
    & $adb shell wm size 1200x1920
    & $adb shell wm density 280
    Start-Sleep -Seconds 3

    # 1. Search Hub
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///"
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_search.png" $dir7in "01_offline_search.png"

    # 2. Document Scanner
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///doc-scanner"
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_scanner.png" $dir7in "02_doc_scanner.png"

    # 3. Second Brain
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///second-brain"
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_sb.png" $dir7in "03_second_brain.png"

    # 4. File Manager
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///file-manager"
    Start-Sleep -Seconds 2
    & $adb shell input tap 320 580
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_fm.png" $dir7in "04_file_manager.png"

    # 5. Storage Analyser
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///file-analyser"
    Start-Sleep -Seconds 3
    Capture-Tab "tab7_fa.png" $dir7in "05_storage_analyser.png"

    # 6. Smart Cards
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///cards"
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_cards.png" $dir7in "06_smart_cards.png"

    # 7. Scanned Documents
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///documents"
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_docs.png" $dir7in "07_scanned_documents.png"

    # 8. Settings
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///settings"
    Start-Sleep -Seconds 2
    Capture-Tab "tab7_settings.png" $dir7in "08_privacy_settings.png"

    # ==========================================
    # PART 2: 10-INCH TABLET SCREENSHOTS (2048x1536)
    # ==========================================
    Write-Host "`n=== SWITCHING TO 10-INCH TABLET MODE (2048x1536, 320 dpi) ==="
    & $adb shell wm size 2048x1536
    & $adb shell wm density 320
    Start-Sleep -Seconds 3

    # 1. Search Hub
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///"
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_search.png" $dir10in "01_offline_search.png"

    # 2. Document Scanner
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///doc-scanner"
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_scanner.png" $dir10in "02_doc_scanner.png"

    # 3. Second Brain
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///second-brain"
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_sb.png" $dir10in "03_second_brain.png"

    # 4. File Manager
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///file-manager"
    Start-Sleep -Seconds 2
    & $adb shell input tap 400 480
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_fm.png" $dir10in "04_file_manager.png"

    # 5. Storage Analyser
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///file-analyser"
    Start-Sleep -Seconds 3
    Capture-Tab "tab10_fa.png" $dir10in "05_storage_analyser.png"

    # 6. Smart Cards
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///cards"
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_cards.png" $dir10in "06_smart_cards.png"

    # 7. Scanned Documents
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///documents"
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_docs.png" $dir10in "07_scanned_documents.png"

    # 8. Settings
    & $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///settings"
    Start-Sleep -Seconds 2
    Capture-Tab "tab10_settings.png" $dir10in "08_privacy_settings.png"

} finally {
    Write-Host "`n=== RESTORING PHYSICAL DISPLAY SETTINGS ==="
    & $adb shell wm size reset
    & $adb shell wm density reset
    Start-Sleep -Seconds 1
    & $adb shell wm size
    & $adb shell wm density
    Write-Host "Display successfully restored to native phone state."
}

Write-Host "`nDone capturing tablet screenshots!"
