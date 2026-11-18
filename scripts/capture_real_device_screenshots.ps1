# capture_real_device_screenshots.ps1 — Captures all 8 real device screenshots via USB debugging
$ErrorActionPreference = "Stop"

$adb = "c:\Users\admin\Documents\Antigravity\platform-tools-latest-windows\platform-tools\adb.exe"
$outDir = "c:\Users\admin\Documents\Antigravity\FileLensProComplete\play_store_assets\real_device_screenshots\raw"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

function Capture-Screen($remoteName, $localName) {
    Write-Host "Capturing $localName..."
    & $adb shell screencap -p "/sdcard/$remoteName"
    & $adb pull "/sdcard/$remoteName" "$outDir\$localName"
    & $adb shell rm "/sdcard/$remoteName"
    Write-Host "Pulled $outDir\$localName successfully!"
}

# 1. Capture Screen 01: Offline Search Hub
Write-Host "Navigating to Search Hub..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///"
Start-Sleep -Seconds 2
Capture-Screen "cap_search.png" "01_offline_search.png"

# 3. Capture Screen 02: Pro Document Scanner
Write-Host "Navigating to Document Scanner..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///doc-scanner"
Start-Sleep -Seconds 3
Capture-Screen "cap_scanner.png" "02_doc_scanner.png"

# 4. Capture Screen 03: Second Brain & Action Planner
Write-Host "Navigating to Second Brain..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///second-brain"
Start-Sleep -Seconds 3
Capture-Screen "cap_sb.png" "03_second_brain.png"

# 5. Capture Screen 04: File Manager (with PDFs Folder opened)
Write-Host "Navigating to File Manager..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///file-manager"
Start-Sleep -Seconds 2
& $adb shell input tap 320 620
Start-Sleep -Seconds 2
Capture-Screen "cap_fm.png" "04_file_manager.png"

# 6. Capture Screen 05: Storage Analyser & Cleaner
Write-Host "Navigating to Storage Analyser..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///file-analyser"
Start-Sleep -Seconds 3
Capture-Screen "cap_fa.png" "05_storage_analyser.png"

# 7. Capture Screen 06: Smart Cards Wallet
Write-Host "Navigating to Smart Cards..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///cards"
Start-Sleep -Seconds 3
Capture-Screen "cap_cards.png" "06_smart_cards.png"

# 8. Capture Screen 07: Scanned Documents Hub
Write-Host "Navigating to Scanned Documents Hub..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///documents"
Start-Sleep -Seconds 3
Capture-Screen "cap_docs.png" "07_scanned_documents.png"

# 9. Capture Screen 08: Zero Cloud Privacy & Settings
Write-Host "Navigating to Privacy Settings..."
& $adb shell am start -a android.intent.action.VIEW -d "filelenspro:///settings"
Start-Sleep -Seconds 3
Capture-Screen "cap_settings.png" "08_privacy_settings.png"

Write-Host "All 8 real device screenshots captured!"
Get-ChildItem -Path $outDir | Select-Object Name, Length
