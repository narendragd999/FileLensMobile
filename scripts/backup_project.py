"""
FileLens Pro — Clean Source Backup Utility
Creates a timestamped, clean zip archive of the complete codebase
excluding node_modules, build artifacts, gradle caches, and temp files.
"""
import os
import sys
import time
import zipfile
import shutil
from datetime import datetime
from pathlib import Path

# Paths
PROJECT_DIR = Path(__file__).resolve().parent.parent
BACKUP_DIR = PROJECT_DIR.parent
APK_BACKUP_DIR = BACKUP_DIR / "Backup Mobile APK"

EXCLUDE_DIR_NAMES = {
    "node_modules",
    ".expo",
    ".git",
    "build",
    ".gradle",
    ".cxx",
    "__pycache__",
    ".pytest_cache",
    ".idea",
    ".vscode"
}

EXCLUDE_EXTENSIONS = {
    ".log",
    ".tmp",
    ".apk",
    ".aab",
    ".pyc",
    ".pyo"
}

def should_exclude(rel_path: Path) -> bool:
    # Check directory parts
    for part in rel_path.parts[:-1]:
        if part in EXCLUDE_DIR_NAMES:
            return True
        if part.startswith(".gradle"):
            return True
            
    # Check filename / extension
    ext = rel_path.suffix.lower()
    if ext in EXCLUDE_EXTENSIONS:
        return True
        
    if ext == ".zip":
        return True
        
    return False

def create_source_backup():
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped_zip_name = f"FileLensPro_CompleteBackup_{now_str}.zip"
    timestamped_zip_path = BACKUP_DIR / timestamped_zip_name
    latest_source_zip_path = BACKUP_DIR / "FileLensPro_SourceOnly.zip"

    print("=" * 70)
    print("                FILELENS PRO — CLEAN SOURCE BACKUP")
    print("=" * 70)
    print(f"\n[1/4] Source Directory : {PROJECT_DIR}")
    print(f"[2/4] Target Archive   : {timestamped_zip_path.name}")
    print(f"      Permanent Alias  : {latest_source_zip_path.name}")

    files_to_zip = []
    total_size = 0

    for root, dirs, files in os.walk(PROJECT_DIR):
        # In-place directory pruning
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIR_NAMES and not d.startswith(".gradle")]

        for f in files:
            full_path = Path(root) / f
            rel_path = full_path.relative_to(PROJECT_DIR)

            if not should_exclude(rel_path):
                try:
                    sz = full_path.stat().st_size
                    files_to_zip.append((full_path, str(rel_path).replace("\\", "/"), sz))
                    total_size += sz
                except Exception as err:
                    print(f"  [Skip] {rel_path}: {err}")

    uncomp_mb = total_size / (1024 * 1024)
    print(f"\n[3/4] Compressing {len(files_to_zip):,} files ({uncomp_mb:.2f} MB uncompressed)...")

    start_t = time.time()
    with zipfile.ZipFile(timestamped_zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_path, arcname, _ in files_to_zip:
            zf.write(full_path, arcname=arcname)

    elapsed = time.time() - start_t
    zip_size_mb = timestamped_zip_path.stat().st_size / (1024 * 1024)

    # Maintain FileLensPro_SourceOnly.zip alias
    shutil.copy2(timestamped_zip_path, latest_source_zip_path)

    # Also backup the release APK and AAB if present
    today_folder = datetime.now().strftime("Release_%Y-%m-%d")
    release_dest_dir = APK_BACKUP_DIR / today_folder
    release_dest_dir.mkdir(parents=True, exist_ok=True)

    apk_source = PROJECT_DIR / "FileLensPro-Release.apk"
    apk_backed_up = None
    if apk_source.exists():
        apk_dest = release_dest_dir / f"FileLensPro-Release-{now_str}.apk"
        shutil.copy2(apk_source, apk_dest)
        apk_latest = release_dest_dir / "FileLensPro-Release-Latest.apk"
        shutil.copy2(apk_source, apk_latest)
        apk_backed_up = apk_dest

    aab_source = PROJECT_DIR / "FileLensPro-Release.aab"
    aab_backed_up = None
    if aab_source.exists():
        aab_dest = release_dest_dir / f"FileLensPro-Release-{now_str}.aab"
        shutil.copy2(aab_source, aab_dest)
        aab_latest = release_dest_dir / "FileLensPro-Release-Latest.aab"
        shutil.copy2(aab_source, aab_latest)
        aab_backed_up = aab_dest

    # Also backup release_v2.0.0 folder items
    v2_dir = PROJECT_DIR / "release_v2.0.0"
    if v2_dir.exists():
        for v2_file in v2_dir.glob("*.*"):
            shutil.copy2(v2_file, release_dest_dir / v2_file.name)

    print("\n" + "=" * 70)
    print("                    BACKUP COMPLETED SUCCESSFULLY!")
    print("=" * 70)
    print(f"  • Archive (Timestamped) : {timestamped_zip_path}")
    print(f"  • Archive (Source Only) : {latest_source_zip_path}")
    print(f"  • Files Archived        : {len(files_to_zip):,} files")
    print(f"  • Source Size           : {uncomp_mb:.2f} MB")
    print(f"  • Compressed Size       : {zip_size_mb:.2f} MB")
    print(f"  • Time Elapsed          : {elapsed:.2f} seconds")
    if apk_backed_up:
        print(f"  • Release APK Backup    : {apk_backed_up}")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    create_source_backup()
