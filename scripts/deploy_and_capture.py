import subprocess
import time
import os
import shutil

ADB = r"c:\Users\admin\Documents\Antigravity\platform-tools-latest-windows\platform-tools\adb.exe"
PROJECT_DIR = r"c:\Users\admin\Documents\Antigravity\FileLensProComplete"

def run_cmd(cmd, check=True):
    print(f"RUNNING: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    res = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, cwd=PROJECT_DIR)
    print(res.stdout)
    if res.stderr:
        print("ERR:", res.stderr)
    if check and res.returncode != 0:
        raise RuntimeError(f"Command failed with code {res.returncode}")
    return res

def main():
    clean_apk = os.path.join(PROJECT_DIR, "release_v2.0.0", "FileLensPro-v2.0.0-clean.apk")
    release_apk = os.path.join(PROJECT_DIR, "release_v2.0.0", "FileLensPro-v2.0.0-release.apk")
    
    if os.path.exists(clean_apk):
        shutil.copyfile(clean_apk, release_apk)
        print("Updated FileLensPro-v2.0.0-release.apk with clean build")
        
    print("\n--- 1. Checking ADB Devices ---")
    run_cmd([ADB, "devices"])

    print("\n--- 2. Installing Clean APK ---")
    run_cmd([ADB, "install", "-r", release_apk])

    print("\n--- 3. Granting Permissions ---")
    run_cmd([ADB, "shell", "appops", "set", "com.filelenspro.app", "MANAGE_EXTERNAL_STORAGE", "allow"])
    run_cmd([ADB, "shell", "pm", "grant", "com.filelenspro.app", "android.permission.CAMERA"], check=False)
    run_cmd([ADB, "shell", "pm", "grant", "com.filelenspro.app", "android.permission.READ_EXTERNAL_STORAGE"], check=False)
    run_cmd([ADB, "shell", "pm", "grant", "com.filelenspro.app", "android.permission.WRITE_EXTERNAL_STORAGE"], check=False)

    print("\n--- 4. Launching Clean App ---")
    run_cmd([ADB, "shell", "am", "force-stop", "com.filelenspro.app"])
    time.sleep(1)
    run_cmd([ADB, "shell", "am", "start", "-n", "com.filelenspro.app/.MainActivity"])
    time.sleep(4)

    print("\n--- 5. Capturing Phone Screenshots ---")
    run_cmd(["powershell", "-ExecutionPolicy", "Bypass", "-File", "scripts/capture_real_device_screenshots.ps1"])

    print("\n--- 6. Framing Phone Mockups (1080x2400) ---")
    run_cmd(["python", "scripts/frame_real_device_screenshots.py"])

    print("\n--- 7. Capturing Tablet Screenshots (7in & 10in) ---")
    run_cmd(["powershell", "-ExecutionPolicy", "Bypass", "-File", "scripts/capture_tablet_screenshots.ps1"])

    print("\n=== ALL SCREENSHOTS SUCCESSFULLY CAPTURED & FRAMED ===")

if __name__ == "__main__":
    main()
