import subprocess
import time
import os

ADB = r"c:\Users\admin\Documents\Antigravity\platform-tools-latest-windows\platform-tools\adb.exe"
ROOT_DIR = r"c:\Users\admin\Documents\Antigravity\FileLensProComplete"
RAW_PHONE_DIR = os.path.join(ROOT_DIR, "play_store_assets", "real_device_screenshots", "raw")
TAB7_DIR = os.path.join(ROOT_DIR, "play_store_assets", "screenshots", "tablet_7in")
TAB10_DIR = os.path.join(ROOT_DIR, "play_store_assets", "screenshots", "tablet_10in")

PDF_URI_ENC = "%2Fsdcard%2FDocuments%2FFileLensPro%2FTax_Invoice_2026_Q3.pdf"

def adb_cmd(args):
    return subprocess.run([ADB] + args, capture_output=True, text=True, cwd=ROOT_DIR)

def capture_screen(remote_name, local_dest):
    adb_cmd(["shell", "screencap", "-p", f"/sdcard/{remote_name}"])
    adb_cmd(["pull", f"/sdcard/{remote_name}", local_dest])
    adb_cmd(["shell", "rm", f"/sdcard/{remote_name}"])
    print(f"  [OK] Saved -> {local_dest} ({os.path.getsize(local_dest)} bytes)")

def capture_phone_screens():
    os.makedirs(RAW_PHONE_DIR, exist_ok=True)
    print("\n=======================================================")
    print("  CAPTURING 10 REAL DEVICE PHONE SCREENSHOTS (1080x2460) ")
    print("=======================================================")
    adb_cmd(["shell", "wm", "size", "reset"])
    adb_cmd(["shell", "wm", "density", "reset"])
    time.sleep(2)

    # Dismiss any leftover dialogs
    adb_cmd(["shell", "input", "keyevent", "4"])
    time.sleep(0.5)

    # 1. Search Hub
    print("\n1/10: Offline Search Hub...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///"])
    time.sleep(2.5)
    # Tap 'Agree & Grant Access' if shown
    adb_cmd(["shell", "input", "tap", "540", "1720"])
    time.sleep(1)
    capture_screen("phone_01.png", os.path.join(RAW_PHONE_DIR, "01_offline_search.png"))

    # 2. Document Scanner
    print("\n2/10: Document Scanner...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///doc-scanner"])
    time.sleep(3)
    capture_screen("phone_02.png", os.path.join(RAW_PHONE_DIR, "02_doc_scanner.png"))

    # 3. Second Brain
    print("\n3/10: Second Brain...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///second-brain"])
    time.sleep(2.5)
    capture_screen("phone_03.png", os.path.join(RAW_PHONE_DIR, "03_second_brain.png"))

    # 4. File Manager
    print("\n4/10: File Manager...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///file-manager"])
    time.sleep(2)
    adb_cmd(["shell", "input", "tap", "320", "620"]) # tap folder
    time.sleep(2)
    capture_screen("phone_04.png", os.path.join(RAW_PHONE_DIR, "04_file_manager.png"))

    # 5. Storage Analyser
    print("\n5/10: Storage Analyser...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///file-analyser"])
    time.sleep(3)
    capture_screen("phone_05.png", os.path.join(RAW_PHONE_DIR, "05_storage_analyser.png"))

    # 6. Smart Cards
    print("\n6/10: Smart Cards...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///cards"])
    time.sleep(2.5)
    capture_screen("phone_06.png", os.path.join(RAW_PHONE_DIR, "06_smart_cards.png"))

    # 7. Scanned Documents Hub (System Files tab)
    print("\n7/10: Scanned Documents Hub (System Files)...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///documents"])
    time.sleep(2)
    adb_cmd(["shell", "input", "tap", "720", "340"]) # tap System Files pill
    time.sleep(2)
    capture_screen("phone_07.png", os.path.join(RAW_PHONE_DIR, "07_scanned_documents.png"))

    # 8. Privacy Settings
    print("\n8/10: Zero Cloud Privacy Settings...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///settings"])
    time.sleep(2.5)
    capture_screen("phone_08.png", os.path.join(RAW_PHONE_DIR, "08_privacy_settings.png"))

    # 9. PDF Editor & Filters
    print("\n9/10: PDF In-App Editor & Filters...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"filelenspro:///documents?openDocUri={PDF_URI_ENC}"])
    time.sleep(3.5)
    adb_cmd(["shell", "input", "tap", "540", "2300"]) # Tap 'Edit' button
    time.sleep(2)
    capture_screen("phone_09.png", os.path.join(RAW_PHONE_DIR, "09_pdf_editor.png"))

    # Close viewer modal
    adb_cmd(["shell", "input", "keyevent", "4"])
    time.sleep(1)

    # 10. Multi-Page Organizer Workbench
    print("\n10/10: Multi-Page Organizer Workbench...")
    adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"filelenspro:///page-organizer?pdfUri={PDF_URI_ENC}&fileName=Tax_Invoice_2026_Q3.pdf"])
    time.sleep(3.5)
    capture_screen("phone_10.png", os.path.join(RAW_PHONE_DIR, "10_page_organizer.png"))

    # Close organizer
    adb_cmd(["shell", "input", "keyevent", "4"])
    time.sleep(1)

def capture_tablet_screens():
    os.makedirs(TAB7_DIR, exist_ok=True)
    os.makedirs(TAB10_DIR, exist_ok=True)

    try:
        # ==========================================
        # PART A: 7-INCH TABLET SCREENSHOTS (1200x1920, 280 dpi)
        # ==========================================
        print("\n=======================================================")
        print("  CAPTURING 10 TABLET 7-INCH SCREENSHOTS (1200x1920)   ")
        print("=======================================================")
        adb_cmd(["shell", "wm", "size", "1200x1920"])
        adb_cmd(["shell", "wm", "density", "280"])
        time.sleep(3)

        # 1. Search Hub
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///"])
        time.sleep(2)
        adb_cmd(["shell", "input", "tap", "600", "1400"]) # dismiss if any
        capture_screen("tab7_01.png", os.path.join(TAB7_DIR, "01_offline_search.png"))

        # 2. Document Scanner
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///doc-scanner"])
        time.sleep(2.5)
        capture_screen("tab7_02.png", os.path.join(TAB7_DIR, "02_doc_scanner.png"))

        # 3. Second Brain
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///second-brain"])
        time.sleep(2)
        capture_screen("tab7_03.png", os.path.join(TAB7_DIR, "03_second_brain.png"))

        # 4. File Manager
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///file-manager"])
        time.sleep(2)
        adb_cmd(["shell", "input", "tap", "320", "580"])
        time.sleep(2)
        capture_screen("tab7_04.png", os.path.join(TAB7_DIR, "04_file_manager.png"))

        # 5. Storage Analyser
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///file-analyser"])
        time.sleep(2.5)
        capture_screen("tab7_05.png", os.path.join(TAB7_DIR, "05_storage_analyser.png"))

        # 6. Smart Cards
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///cards"])
        time.sleep(2)
        capture_screen("tab7_06.png", os.path.join(TAB7_DIR, "06_smart_cards.png"))

        # 7. Scanned Documents (System Files tab)
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///documents"])
        time.sleep(2)
        adb_cmd(["shell", "input", "tap", "800", "280"]) # tap System Files tab
        time.sleep(1.5)
        capture_screen("tab7_07.png", os.path.join(TAB7_DIR, "07_scanned_documents.png"))

        # 8. Settings
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///settings"])
        time.sleep(2)
        capture_screen("tab7_08.png", os.path.join(TAB7_DIR, "08_privacy_settings.png"))

        # 9. PDF Editor & Filters
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"filelenspro:///documents?openDocUri={PDF_URI_ENC}"])
        time.sleep(3)
        adb_cmd(["shell", "input", "tap", "600", "1800"]) # Edit button
        time.sleep(2)
        capture_screen("tab7_09.png", os.path.join(TAB7_DIR, "09_pdf_editor.png"))
        adb_cmd(["shell", "input", "keyevent", "4"])
        time.sleep(1)

        # 10. Multi-Page Organizer Workbench
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"filelenspro:///page-organizer?pdfUri={PDF_URI_ENC}&fileName=Tax_Invoice_2026_Q3.pdf"])
        time.sleep(3)
        capture_screen("tab7_10.png", os.path.join(TAB7_DIR, "10_page_organizer.png"))
        adb_cmd(["shell", "input", "keyevent", "4"])
        time.sleep(1)

        # ==========================================
        # PART B: 10-INCH TABLET SCREENSHOTS (2048x1536, 320 dpi)
        # ==========================================
        print("\n=======================================================")
        print("  CAPTURING 10 TABLET 10-INCH SCREENSHOTS (2048x1536)  ")
        print("=======================================================")
        adb_cmd(["shell", "wm", "size", "2048x1536"])
        adb_cmd(["shell", "wm", "density", "320"])
        time.sleep(3)

        # 1. Search Hub
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///"])
        time.sleep(2)
        adb_cmd(["shell", "input", "tap", "1024", "1100"]) # dismiss if any
        capture_screen("tab10_01.png", os.path.join(TAB10_DIR, "01_offline_search.png"))

        # 2. Document Scanner
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///doc-scanner"])
        time.sleep(2.5)
        capture_screen("tab10_02.png", os.path.join(TAB10_DIR, "02_doc_scanner.png"))

        # 3. Second Brain
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///second-brain"])
        time.sleep(2)
        capture_screen("tab10_03.png", os.path.join(TAB10_DIR, "03_second_brain.png"))

        # 4. File Manager
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///file-manager"])
        time.sleep(2)
        adb_cmd(["shell", "input", "tap", "400", "480"])
        time.sleep(2)
        capture_screen("tab10_04.png", os.path.join(TAB10_DIR, "04_file_manager.png"))

        # 5. Storage Analyser
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///file-analyser"])
        time.sleep(2.5)
        capture_screen("tab10_05.png", os.path.join(TAB10_DIR, "05_storage_analyser.png"))

        # 6. Smart Cards
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///cards"])
        time.sleep(2)
        capture_screen("tab10_06.png", os.path.join(TAB10_DIR, "06_smart_cards.png"))

        # 7. Scanned Documents
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///documents"])
        time.sleep(2)
        adb_cmd(["shell", "input", "tap", "1400", "220"]) # tap System Files tab
        time.sleep(1.5)
        capture_screen("tab10_07.png", os.path.join(TAB10_DIR, "07_scanned_documents.png"))

        # 8. Settings
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "filelenspro:///settings"])
        time.sleep(2)
        capture_screen("tab10_08.png", os.path.join(TAB10_DIR, "08_privacy_settings.png"))

        # 9. PDF Editor & Filters
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"filelenspro:///documents?openDocUri={PDF_URI_ENC}"])
        time.sleep(3)
        adb_cmd(["shell", "input", "tap", "1024", "1450"]) # Edit button
        time.sleep(2)
        capture_screen("tab10_09.png", os.path.join(TAB10_DIR, "09_pdf_editor.png"))
        adb_cmd(["shell", "input", "keyevent", "4"])
        time.sleep(1)

        # 10. Multi-Page Organizer Workbench
        adb_cmd(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"filelenspro:///page-organizer?pdfUri={PDF_URI_ENC}&fileName=Tax_Invoice_2026_Q3.pdf"])
        time.sleep(3)
        capture_screen("tab10_10.png", os.path.join(TAB10_DIR, "10_page_organizer.png"))
        adb_cmd(["shell", "input", "keyevent", "4"])
        time.sleep(1)

    finally:
        print("\n=== RESTORING PHYSICAL DISPLAY SETTINGS ===")
        adb_cmd(["shell", "wm", "size", "reset"])
        adb_cmd(["shell", "wm", "density", "reset"])
        time.sleep(1.5)
        res = adb_cmd(["shell", "wm", "size"])
        print("Size:", res.stdout.strip())
        res_d = adb_cmd(["shell", "wm", "density"])
        print("Density:", res_d.stdout.strip())
        print("Display successfully restored to native phone state.")

def main():
    capture_phone_screens()
    print("\nFraming all 10 phone mockups (1080x2400)...")
    subprocess.run(["python", "scripts/frame_real_device_screenshots.py"], cwd=ROOT_DIR)
    capture_tablet_screens()
    print("\n\n=======================================================")
    print("  ALL 10 SCREENS CAPTURED ACROSS ALL FORM FACTORS!     ")
    print("=======================================================")

if __name__ == "__main__":
    main()
