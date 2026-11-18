"""
frame_real_device_screenshots.py — Frames real device screenshots (1080x2460) with marketing headers into 1080x2400 Google Play Store promotional graphics.
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = r"c:\Users\admin\Documents\Antigravity\FileLensProComplete"
RAW_DIR = os.path.join(ROOT_DIR, "play_store_assets", "real_device_screenshots", "raw")
FRAMED_DIR = os.path.join(ROOT_DIR, "play_store_assets", "real_device_screenshots", "framed")

CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 2400

# Headline specifications for the 8 flagship feature screens
SCREEN_META = {
    "01_offline_search.png": {
        "tag": "OFFLINE NEURAL SEARCH",
        "tag_color": "#38BDF8",
        "title": "Search Millions of Words\nin Seconds, 100% Offline",
        "sub": "FTS5 Full-Text Indexing • Local Vector AI • 0 Bytes to Cloud",
        "bg_top": "#0F172A",
        "bg_bot": "#0284C7",
    },
    "02_doc_scanner.png": {
        "tag": "PRO PDF SCANNER",
        "tag_color": "#34D399",
        "title": "Smart Auto-Edge Crop\n& Multi-Page PDF Scan",
        "sub": "Perspective Correction • Crisp B&W Filters • Signatures & Watermarks",
        "bg_top": "#064E3B",
        "bg_bot": "#059669",
    },
    "03_second_brain.png": {
        "tag": "VOICE SECOND BRAIN",
        "tag_color": "#A78BFA",
        "title": "Your Offline Second Brain\nWith Action Commitments",
        "sub": "Spoken Voice Notes • Auto Checklists • Cross-Linked Documents",
        "bg_top": "#1E1B4B",
        "bg_bot": "#6366F1",
    },
    "04_file_manager.png": {
        "tag": "ADVANCED FILE MANAGER",
        "tag_color": "#38BDF8",
        "title": "Powerful File Manager\nBrowse Internal & SD Card",
        "sub": "Animated Scanning • Dual Grid/List • Batch Move, Copy & WiFi Share",
        "bg_top": "#0B192C",
        "bg_bot": "#1E3E62",
    },
    "05_storage_analyser.png": {
        "tag": "DEEP STORAGE CLEANER",
        "tag_color": "#FBBF24",
        "title": "Deep Storage Analyser\nFree Gigabytes Instantly",
        "sub": "Visual Drive Breakdown • Exact Duplicates • Junk Cache Purge",
        "bg_top": "#451A03",
        "bg_bot": "#D97706",
    },
    "06_smart_cards.png": {
        "tag": "SMART CARDS VAULT",
        "tag_color": "#F472B6",
        "title": "Smart Identity Wallet\nAadhaar, PAN & Health IDs",
        "sub": "Instant Full-Text Search • 2-in-1 KYC Compositing • 100% Secure",
        "bg_top": "#500724",
        "bg_bot": "#BE185D",
    },
    "07_scanned_documents.png": {
        "tag": "DOCUMENT STUDIO",
        "tag_color": "#6EE7B7",
        "title": "Central Scans & PDF Hub\nCategorized & Searchable",
        "sub": "Merge, Rotate, Split & Sign • Tags & Filters • Instant OCR",
        "bg_top": "#022C22",
        "bg_bot": "#047857",
    },
    "08_privacy_settings.png": {
        "tag": "100% PRIVACY GUARANTEE",
        "tag_color": "#60A5FA",
        "title": "Zero Cloud. Zero Ads.\nComplete Data Sovereignty",
        "sub": "All Data Stays On Your Phone • No Telemetry • No Tracking Ever",
        "bg_top": "#0F172A",
        "bg_bot": "#2563EB",
    },
    "09_pdf_editor.png": {
        "tag": "PRO PDF EDITOR & FILTERS",
        "tag_color": "#38BDF8",
        "title": "Edit, Sign & Enhance\nPDF Documents In-App",
        "sub": "Color, B&W & Photo Filters • Digital Signature • Fast Page Scrubber",
        "bg_top": "#0C4A6E",
        "bg_bot": "#0284C7",
    },
    "10_page_organizer.png": {
        "tag": "PAGE ORGANIZER WORKBENCH",
        "tag_color": "#F59E0B",
        "title": "Organize, Reorder, Split\n& Merge Multi-Page PDFs",
        "sub": "Visual Thumbnail Grid • Insert Scans • Rotate & Delete With 1 Tap",
        "bg_top": "#451A03",
        "bg_bot": "#B45309",
    },
}

def create_gradient(width, height, top_color_hex, bot_color_hex):
    base = Image.new("RGB", (width, height))
    top_r, top_g, top_b = tuple(int(top_color_hex.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    bot_r, bot_g, bot_b = tuple(int(bot_color_hex.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    
    draw = ImageDraw.Draw(base)
    for y in range(height):
        ratio = y / float(height)
        r = int(top_r + (bot_r - top_r) * ratio)
        g = int(top_g + (bot_g - top_g) * ratio)
        b = int(top_b + (bot_b - top_b) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return base

def get_font(size: int, bold: bool = False):
    font_names = [
        "segoeuib.ttf" if bold else "segoeui.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
        "calibrib.ttf" if bold else "calibri.ttf",
    ]
    for name in font_names:
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except Exception:
            pass
    return ImageFont.load_default()

def frame_screenshot(raw_filename, meta):
    raw_path = os.path.join(RAW_DIR, raw_filename)
    if not os.path.exists(raw_path):
        print(f"Warning: Raw file {raw_path} not found.")
        return
        
    raw_img = Image.open(raw_path).convert("RGBA")
    
    # 1. Background gradient
    canvas = create_gradient(CANVAS_WIDTH, CANVAS_HEIGHT, meta["bg_top"], meta["bg_bot"]).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    
    # Fonts
    tag_font = get_font(26, bold=True)
    title_font = get_font(52, bold=True)
    sub_font = get_font(26, bold=False)

    # 2. Top Marketing Content (Height: ~380px)
    # Tag Badge
    tag_bbox = tag_font.getbbox(meta["tag"])
    tag_w = tag_bbox[2] - tag_bbox[0]
    draw.rounded_rectangle([(60, 60), (60 + tag_w + 40, 110)], radius=8, fill="#FFFFFF18", outline=meta["tag_color"], width=2)
    draw.text((80, 70), meta["tag"], fill=meta["tag_color"], font=tag_font)
    
    # Main Headline
    draw.text((60, 135), meta["title"], fill="#FFFFFF", font=title_font, spacing=12)
    
    # Sub-headline
    draw.text((60, 290), meta["sub"], fill="#E2E8F0", font=sub_font)
    
    # 3. Device Mockup Frame (starts at y=370 to bottom)
    # Screen target dimensions: width: 960px, rounded corners, subtle border
    target_device_w = 960
    scale = target_device_w / float(raw_img.width)
    target_device_h = int(raw_img.height * scale)
    
    scaled_screen = raw_img.resize((target_device_w, target_device_h), Image.Resampling.LANCZOS)
    
    # Device outer border/chassis
    dev_x = (CANVAS_WIDTH - target_device_w) // 2
    dev_y = 390
    
    # Subtle drop shadow behind phone
    shadow_box = Image.new("RGBA", (target_device_w + 30, target_device_h + 30), color=(0, 0, 0, 80))
    canvas.paste(shadow_box, (dev_x - 15, dev_y - 10), shadow_box)
    
    # Paste device screen
    canvas.paste(scaled_screen, (dev_x, dev_y), scaled_screen)
    
    # Draw sleek device outer stroke
    draw.rectangle(
        [(dev_x - 3, dev_y - 3), (dev_x + target_device_w + 3, CANVAS_HEIGHT)],
        outline="#FFFFFF40",
        width=4
    )
    
    out_path = os.path.join(FRAMED_DIR, raw_filename)
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"Rendered framed screenshot -> {out_path}")

def main():
    os.makedirs(FRAMED_DIR, exist_ok=True)
    print("Framing real device screenshots into Play Store mockups...")
    for raw_name, meta in SCREEN_META.items():
        frame_screenshot(raw_name, meta)
    print("Framing complete!")

if __name__ == "__main__":
    main()
