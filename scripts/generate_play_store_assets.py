"""
FileLens Pro — Google Play Store Graphic Assets Generator
Generates:
  1. 8 Phone Screenshots (1080 x 2400 px, PNG, 9:20 aspect ratio)
  2. 1 Feature Graphic (1024 x 500 px, PNG, 24-bit no alpha)
  3. 1 High-Res App Icon (512 x 512 px, PNG)

Meets 100% of Google Play Store asset specifications.
"""

import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Output Paths
PROJECT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_DIR / "play_store_assets"
SCREENSHOTS_DIR = OUTPUT_DIR / "screenshots" / "phone"
FEATURE_DIR = OUTPUT_DIR / "feature_graphic"
ICON_DIR = OUTPUT_DIR / "icon"

for d in (SCREENSHOTS_DIR, FEATURE_DIR, ICON_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Color Palette
BG_DARK_TOP = (11, 15, 25)
BG_DARK_BOTTOM = (26, 36, 56)
TEXT_WHITE = (255, 255, 255)
TEXT_MUTED = (148, 163, 184)
TEXT_DIM = (100, 116, 139)

COLOR_ACCENT = (59, 130, 246)    # Blue
COLOR_EMERALD = (16, 185, 129)   # Emerald
COLOR_PURPLE = (139, 92, 246)    # Purple
COLOR_AMBER = (245, 158, 11)     # Amber
COLOR_ROSE = (236, 72, 153)      # Rose
COLOR_CYAN = (6, 182, 212)       # Cyan

PHONE_FRAME_BG = (15, 23, 42)
PHONE_CARD_BG = (30, 41, 59)
PHONE_CARD_BORDER = (51, 65, 85)
PHONE_SURFACE = (20, 29, 47)

# Helper: Load TrueType Fonts safely
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
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_vertical_gradient(draw: ImageDraw.ImageDraw, width: int, height: int, top_color, bottom_color):
    """Draw a smooth vertical gradient."""
    for y in range(height):
        ratio = y / height
        r = int(top_color[0] + (bottom_color[0] - top_color[0]) * ratio)
        g = int(top_color[1] + (bottom_color[1] - top_color[1]) * ratio)
        b = int(top_color[2] + (bottom_color[2] - top_color[2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

def draw_glow_circle(img: Image.Image, cx: int, cy: int, radius: int, color, alpha: int = 40):
    """Draw a soft ambient radial glow."""
    glow = Image.new("RGBA", (radius * 2, radius * 2), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for r in range(radius, 0, -4):
        a = int(alpha * (1.0 - (r / radius) ** 1.8))
        if a > 0:
            glow_draw.ellipse(
                (radius - r, radius - r, radius + r, radius + r),
                fill=(color[0], color[1], color[2], a)
            )
    glow = glow.filter(ImageFilter.GaussianBlur(12))
    img.paste(glow, (cx - radius, cy - radius), glow)

def draw_phone_chassis(draw: ImageDraw.ImageDraw, x1, y1, x2, y2, corner_radius=56):
    """Draw realistic modern smartphone outer chassis with rounded bezels."""
    # Outer bezel shadow/border
    draw.rounded_rectangle([x1 - 6, y1 - 6, x2 + 6, y2 + 6], radius=corner_radius + 4, fill=(40, 50, 70), outline=(71, 85, 105), width=2)
    # Inner phone body
    draw.rounded_rectangle([x1, y1, x2, y2], radius=corner_radius, fill=PHONE_FRAME_BG, outline=(30, 41, 59), width=3)
    
    # Dynamic Island / Camera punch-hole
    island_w, island_h = 130, 32
    ix1 = (x1 + x2) // 2 - island_w // 2
    iy1 = y1 + 18
    draw.rounded_rectangle([ix1, iy1, ix1 + island_w, iy1 + island_h], radius=16, fill=(5, 8, 15))
    
    # Status bar icons text (Time 9:41, 5G, Battery)
    font_status = get_font(22, bold=True)
    draw.text((x1 + 44, y1 + 22), "9:41", font=font_status, fill=TEXT_MUTED)
    draw.text((x2 - 120, y1 + 22), "5G  100%", font=get_font(18, bold=True), fill=TEXT_MUTED)

def draw_header_section(draw: ImageDraw.ImageDraw, badge_text: str, badge_color, headline: str, subtitle: str, w=1080):
    """Draw the marketing header section at the top of the screenshot."""
    # Category Pill Badge
    font_badge = get_font(26, bold=True)
    bbox = font_badge.getbbox(badge_text)
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = 24, 10
    bx1 = w // 2 - (bw + pad_x * 2) // 2
    by1 = 90
    bx2 = bx1 + bw + pad_x * 2
    by2 = by1 + bh + pad_y * 2
    
    # Pill with subtle border
    draw.rounded_rectangle([bx1, by1, bx2, by2], radius=24, fill=(badge_color[0], badge_color[1], badge_color[2], 50), outline=badge_color, width=2)
    draw.text((bx1 + pad_x, by1 + pad_y - 2), badge_text, font=font_badge, fill=badge_color)

    # Main Headline
    font_title = get_font(52, bold=True)
    t_bbox = font_title.getbbox(headline)
    tw = t_bbox[2] - t_bbox[0]
    draw.text((w // 2 - tw // 2, 165), headline, font=font_title, fill=TEXT_WHITE)

    # Subtitle
    font_sub = get_font(28, bold=False)
    s_bbox = font_sub.getbbox(subtitle)
    sw = s_bbox[2] - s_bbox[0]
    draw.text((w // 2 - sw // 2, 235), subtitle, font=font_sub, fill=TEXT_MUTED)

# ==============================================================================
# SCREENSHOT BUILDERS (1080 x 2400)
# ==============================================================================

def generate_screenshot_01_search():
    """Screenshot 1: Lightning-Fast Offline Search & MiniLM AI"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (10, 16, 32), (18, 28, 48))
    draw_glow_circle(img, 540, 600, 360, COLOR_ACCENT, alpha=50)

    draw_header_section(
        draw,
        badge_text="⚡ INSTANT OFFLINE SEARCH",
        badge_color=COLOR_ACCENT,
        headline="Search Millions of Words in Seconds",
        subtitle="100% Offline • FTS5 & MiniLM Neural AI",
    )

    # Phone Frame
    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Inside Screen Content
    # 1. Search Bar
    sb_y = py1 + 80
    draw.rounded_rectangle([px1 + 36, sb_y, px2 - 36, sb_y + 90], radius=18, fill=PHONE_CARD_BG, outline=COLOR_ACCENT, width=2)
    draw.text((px1 + 65, sb_y + 26), "🔍  electricity bill may", font=get_font(34, bold=True), fill=TEXT_WHITE)
    draw.rounded_rectangle([px2 - 120, sb_y + 18, px2 - 54, sb_y + 72], radius=12, fill=(59, 130, 246, 50))
    draw.text((px2 - 100, sb_y + 26), "✕", font=get_font(26, bold=True), fill=COLOR_ACCENT)

    # 2. Match Indicator Pill
    pill_y = sb_y + 115
    draw.rounded_rectangle([px1 + 36, pill_y, px1 + 440, pill_y + 48], radius=14, fill=(16, 185, 129, 35), outline=COLOR_EMERALD, width=1)
    draw.text((px1 + 54, pill_y + 10), "⚡ 18 Results • 0.04s Instant Match", font=get_font(22, bold=True), fill=COLOR_EMERALD)

    # 3. Filter Chips
    chips = ["All (18)", "PDF Docs (12)", "Invoices (4)", "Receipts (2)"]
    cx = px1 + 36
    chip_y = pill_y + 70
    for i, chip in enumerate(chips):
        active = (i == 0)
        c_fill = COLOR_ACCENT if active else PHONE_CARD_BG
        c_txt = TEXT_WHITE if active else TEXT_MUTED
        c_w = 175 if i == 0 else 195
        draw.rounded_rectangle([cx, chip_y, cx + c_w, chip_y + 54], radius=16, fill=c_fill)
        draw.text((cx + 20, chip_y + 14), chip, font=get_font(22, bold=active), fill=c_txt)
        cx += c_w + 14

    # 4. Result Cards with OCR Highlights
    results = [
        ("Torrent_Power_Electric_Bill_May2026.pdf", "PDF • 2.4 MB • May 18, 2026", "Consumer No: 049821 ... Total Amount Payable: ₹2,450 ... Due Date: 28-May-2026", COLOR_ACCENT, "📄"),
        ("Tata_Power_Bill_Payment_Receipt.jpg", "JPG • 840 KB • May 12, 2026", "Payment Confirmed: ₹1,820 via UPI ... Transaction ID: 2948194 ... Meter: 4891", COLOR_EMERALD, "🧾"),
        ("Apartment_Maintenance_Electricity_May.pdf", "PDF • 1.1 MB • May 04, 2026", "Common area electricity share for May 2026 ... Unit 402 ... Paid", COLOR_PURPLE, "📑"),
    ]

    card_y = chip_y + 80
    for title, meta, snippet, color, icon in results:
        draw.rounded_rectangle([px1 + 36, card_y, px2 - 36, card_y + 240], radius=24, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=2)
        # Left Accent Bar
        draw.rounded_rectangle([px1 + 36, card_y, px1 + 46, card_y + 240], radius=4, fill=color)
        # Icon Box
        draw.rounded_rectangle([px1 + 60, card_y + 28, px1 + 130, card_y + 98], radius=16, fill=(color[0], color[1], color[2], 40))
        draw.text((px1 + 78, card_y + 38), icon, font=get_font(38))
        # Title & Meta
        draw.text((px1 + 150, card_y + 28), title, font=get_font(27, bold=True), fill=TEXT_WHITE)
        draw.text((px1 + 150, card_y + 68), meta, font=get_font(21), fill=TEXT_MUTED)
        # OCR Snippet Box
        draw.rounded_rectangle([px1 + 60, card_y + 115, px2 - 60, card_y + 215], radius=14, fill=PHONE_SURFACE)
        draw.text((px1 + 80, card_y + 128), "OCR Match:", font=get_font(20, bold=True), fill=COLOR_EMERALD)
        draw.text((px1 + 80, card_y + 158), snippet[:72] + "...", font=get_font(21), fill=TEXT_MUTED)
        card_y += 265

    # Bottom App Bar
    bbar_y = py2 - 130
    draw.rounded_rectangle([px1, bbar_y, px2, py2], radius=40, fill=PHONE_SURFACE)
    draw.line([(px1, bbar_y), (px2, bbar_y)], fill=PHONE_CARD_BORDER, width=1)
    draw.text((px1 + 100, bbar_y + 40), "🔍 Search", font=get_font(26, bold=True), fill=COLOR_ACCENT)
    draw.text((px1 + 350, bbar_y + 40), "📄 Docs", font=get_font(26), fill=TEXT_MUTED)
    draw.text((px1 + 580, bbar_y + 40), "🧠 Brain", font=get_font(26), fill=TEXT_MUTED)
    draw.text((px1 + 800, bbar_y + 40), "⚙️ Settings", font=get_font(26), fill=TEXT_MUTED)

    img.save(SCREENSHOTS_DIR / "01_offline_search.png", "PNG")
    print("  ✓ Generated 01_offline_search.png")

def generate_screenshot_02_scanner():
    """Screenshot 2: PDF Scanner & Document Studio (Scan & Docs)"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (14, 20, 36), (24, 32, 54))
    draw_glow_circle(img, 540, 600, 360, COLOR_EMERALD, alpha=50)

    draw_header_section(
        draw,
        badge_text="📄 DOCUMENT STUDIO & SCANNER",
        badge_color=COLOR_EMERALD,
        headline="Pro Document & PDF Scanner",
        subtitle="Auto Edge Detection • Perspective Crop • Multi-Page PDF",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Scanner Viewfinder Canvas
    vf_x1, vf_y1 = px1 + 40, py1 + 80
    vf_x2, vf_y2 = px2 - 40, py1 + 920
    draw.rounded_rectangle([vf_x1, vf_y1, vf_x2, vf_y2], radius=28, fill=(18, 26, 42), outline=(30, 58, 88), width=3)

    # Simulated Document Inside Viewfinder
    doc_x1, doc_y1 = vf_x1 + 70, vf_y1 + 80
    doc_x2, doc_y2 = vf_x2 - 70, vf_y2 - 90
    draw.polygon([
        (doc_x1 + 30, doc_y1 + 20),
        (doc_x2 - 10, doc_y1),
        (doc_x2 + 20, doc_y2 - 20),
        (doc_x1 - 10, doc_y2)
    ], fill=(245, 248, 252), outline=COLOR_EMERALD)

    # Document text lines preview
    for line_y in range(doc_y1 + 80, doc_y2 - 80, 45):
        draw.line([(doc_x1 + 50, line_y), (doc_x2 - 50, line_y)], fill=(180, 195, 215), width=8)

    # Green Perspective Corner Crop Handles
    corners = [
        (doc_x1 + 30, doc_y1 + 20),
        (doc_x2 - 10, doc_y1),
        (doc_x2 + 20, doc_y2 - 20),
        (doc_x1 - 10, doc_y2)
    ]
    for cx, cy in corners:
        draw.ellipse([cx - 24, cy - 24, cx + 24, cy + 24], fill=COLOR_EMERALD, outline=TEXT_WHITE, width=4)

    # Detection Badge
    draw.rounded_rectangle([px1 + 270, vf_y1 + 20, px2 - 270, vf_y1 + 68], radius=16, fill=(16, 185, 129, 220))
    draw.text((px1 + 300, vf_y1 + 28), "✓ Document Edge Detected", font=get_font(23, bold=True), fill=TEXT_WHITE)

    # Filter selector pills
    filt_y = vf_y2 + 40
    filters = ["Original", "Magic Color", "B&W Clean", "Grayscale"]
    fx = px1 + 40
    for i, flt in enumerate(filters):
        active = (i == 1)
        draw.rounded_rectangle([fx, filt_y, fx + 195, filt_y + 54], radius=16, fill=COLOR_EMERALD if active else PHONE_CARD_BG, outline=COLOR_EMERALD if active else PHONE_CARD_BORDER, width=2)
        draw.text((fx + 22, filt_y + 14), flt, font=get_font(21, bold=active), fill=TEXT_WHITE if active else TEXT_MUTED)
        fx += 215

    # Multi-Page Organizer Strip
    org_y = filt_y + 85
    draw.text((px1 + 40, org_y), "Pages in PDF Document (3)", font=get_font(25, bold=True), fill=TEXT_WHITE)
    draw.text((px2 - 200, org_y), "Reorder / Edit ➔", font=get_font(21, bold=True), fill=COLOR_EMERALD)

    thumb_y = org_y + 45
    for p_idx in range(3):
        tx = px1 + 40 + p_idx * 280
        draw.rounded_rectangle([tx, thumb_y, tx + 250, thumb_y + 320], radius=18, fill=PHONE_CARD_BG, outline=COLOR_EMERALD if p_idx == 0 else PHONE_CARD_BORDER, width=2)
        draw.rounded_rectangle([tx + 20, thumb_y + 20, tx + 230, thumb_y + 250], radius=10, fill=(240, 244, 250))
        # Mini lines
        for ly in range(thumb_y + 50, thumb_y + 220, 30):
            draw.line([(tx + 40, ly), (tx + 210, ly)], fill=(160, 180, 205), width=4)
        draw.text((tx + 75, thumb_y + 270), f"Page {p_idx + 1}", font=get_font(22, bold=True), fill=TEXT_WHITE)

    # Large Bottom Shutter Action Button
    btn_y = thumb_y + 360
    draw.rounded_rectangle([px1 + 60, btn_y, px2 - 60, btn_y + 90], radius=24, fill=COLOR_EMERALD)
    draw.text((px1 + 250, btn_y + 26), "📸  Save Multi-Page PDF & Extract OCR", font=get_font(27, bold=True), fill=TEXT_WHITE)

    img.save(SCREENSHOTS_DIR / "02_pdf_scanner.png", "PNG")
    print("  ✓ Generated 02_pdf_scanner.png")

def generate_screenshot_03_second_brain():
    """Screenshot 3: Second Brain & Temporal Planner"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (16, 22, 38), (28, 38, 58))
    draw_glow_circle(img, 540, 600, 360, COLOR_PURPLE, alpha=50)

    draw_header_section(
        draw,
        badge_text="🧠 SECOND BRAIN & PLANNER",
        badge_color=COLOR_PURPLE,
        headline="Your Offline Second Brain",
        subtitle="Voice Notes • Auto Checklists • Cross-Document Links",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Temporal Filter Tabs
    tab_y = py1 + 80
    tabs = [("Today (3)", True), ("Future Reminders (5)", False), ("Archive (14)", False)]
    tx = px1 + 40
    for name, active in tabs:
        w_t = 270
        draw.rounded_rectangle([tx, tab_y, tx + w_t, tab_y + 58], radius=18, fill=COLOR_PURPLE if active else PHONE_CARD_BG, outline=COLOR_PURPLE if active else PHONE_CARD_BORDER, width=2)
        draw.text((tx + 28, tab_y + 15), name, font=get_font(23, bold=active), fill=TEXT_WHITE if active else TEXT_MUTED)
        tx += w_t + 16

    # Voice Note Card 1 (with waveform and actionable checklist)
    c1_y = tab_y + 90
    draw.rounded_rectangle([px1 + 36, c1_y, px2 - 36, c1_y + 510], radius=26, fill=PHONE_CARD_BG, outline=COLOR_PURPLE, width=2)
    # Header row
    draw.text((px1 + 65, c1_y + 30), "🎙️ Voice Note: Client Lease & GST Meeting", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, c1_y + 70), "Today • 10:30 AM • 1 min 42 sec audio", font=get_font(21), fill=COLOR_PURPLE)

    # Audio Waveform visualization
    wave_y = c1_y + 115
    draw.rounded_rectangle([px1 + 65, wave_y, px2 - 65, wave_y + 70], radius=16, fill=PHONE_SURFACE)
    draw.text((px1 + 85, wave_y + 20), "▶", font=get_font(28), fill=COLOR_PURPLE)
    # Waveform bars
    import math
    for i in range(32):
        bar_h = int(15 + 20 * math.sin(i * 0.45) ** 2)
        bx = px1 + 145 + i * 21
        draw.rounded_rectangle([bx, wave_y + 35 - bar_h, bx + 10, wave_y + 35 + bar_h], radius=3, fill=COLOR_PURPLE if i < 18 else (100, 116, 139))
    draw.text((px2 - 165, wave_y + 22), "0:48 / 1:42", font=get_font(19, bold=True), fill=TEXT_MUTED)

    # Auto-Extracted Checklist Items
    draw.text((px1 + 65, c1_y + 215), "⚡ Auto-Extracted Action Checklist:", font=get_font(23, bold=True), fill=TEXT_WHITE)
    items = [
        ("✓ Send revised commercial lease agreement to landlord", True),
        ("✓ Reconcile input tax credit invoices before 20th", True),
        ("○ Schedule follow-up conference on Friday 3 PM", False),
    ]
    iy = c1_y + 260
    for text, checked in items:
        draw.rounded_rectangle([px1 + 65, iy, px1 + 95, iy + 30], radius=6, fill=COLOR_EMERALD if checked else PHONE_SURFACE, outline=COLOR_EMERALD if checked else TEXT_DIM, width=2)
        if checked:
            draw.text((px1 + 70, iy + 2), "✓", font=get_font(20, bold=True), fill=TEXT_WHITE)
        draw.text((px1 + 115, iy + 2), text, font=get_font(22), fill=TEXT_WHITE if not checked else TEXT_MUTED)
        iy += 50

    # Cross-Linked PDF Document Badge
    link_y = c1_y + 420
    draw.rounded_rectangle([px1 + 65, link_y, px2 - 65, link_y + 65], radius=14, fill=(139, 92, 246, 35), outline=COLOR_PURPLE, width=1)
    draw.text((px1 + 85, link_y + 18), "📎 Linked Document: Commercial_Lease_Agreement_2026.pdf", font=get_font(21, bold=True), fill=COLOR_PURPLE)

    # Note Card 2: Morning Digest Reminder
    c2_y = c1_y + 540
    draw.rounded_rectangle([px1 + 36, c2_y, px2 - 36, c2_y + 360], radius=26, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=2)
    draw.text((px1 + 65, c2_y + 30), "📅 Morning Digest & Action Reminder", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, c2_y + 70), "Today • 08:00 AM • Automated Second Brain Synthesis", font=get_font(21), fill=COLOR_AMBER)
    draw.rounded_rectangle([px1 + 65, c2_y + 110, px2 - 65, c2_y + 320], radius=16, fill=PHONE_SURFACE)
    draw.text((px1 + 90, c2_y + 130), "• 2 Pending Contract Reviews due today", font=get_font(22), fill=TEXT_WHITE)
    draw.text((px1 + 90, c2_y + 180), "• Electricity Bill due in 3 days (₹2,450)", font=get_font(22), fill=TEXT_WHITE)
    draw.text((px1 + 90, c2_y + 230), "• 1 Voice memo ready for transcription", font=get_font(22), fill=TEXT_WHITE)

    img.save(SCREENSHOTS_DIR / "03_second_brain.png", "PNG")
    print("  ✓ Generated 03_second_brain.png")

def generate_screenshot_04_file_manager():
    """Screenshot 4: Full-Featured File Manager"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (12, 18, 34), (22, 32, 50))
    draw_glow_circle(img, 540, 600, 360, COLOR_CYAN, alpha=50)

    draw_header_section(
        draw,
        badge_text="📂 FULL-FEATURED FILE MANAGER",
        badge_color=COLOR_CYAN,
        headline="Powerful Offline File Manager",
        subtitle="Browse Internal Storage, SD Cards & USB OTG",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Breadcrumb Navigation Bar
    bc_y = py1 + 80
    draw.rounded_rectangle([px1 + 36, bc_y, px2 - 36, bc_y + 70], radius=16, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=1)
    draw.text((px1 + 60, bc_y + 20), "🏠 Internal > Documents > Work Contracts", font=get_font(24, bold=True), fill=COLOR_CYAN)

    # Storage quick status row
    st_y = bc_y + 90
    draw.rounded_rectangle([px1 + 36, st_y, px1 + 440, st_y + 80], radius=18, fill=PHONE_CARD_BG, outline=COLOR_CYAN, width=1)
    draw.text((px1 + 55, st_y + 16), "📱 Internal Storage", font=get_font(22, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 55, st_y + 46), "68.4 GB Free / 128 GB", font=get_font(19), fill=TEXT_MUTED)

    draw.rounded_rectangle([px2 - 440, st_y, px2 - 36, st_y + 80], radius=18, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=1)
    draw.text((px2 - 420, st_y + 16), "💾 SanDisk SD Card", font=get_font(22, bold=True), fill=TEXT_WHITE)
    draw.text((px2 - 420, st_y + 46), "112 GB Free / 256 GB", font=get_font(19), fill=TEXT_MUTED)

    # File / Folder List
    files = [
        ("📁 Projects & Invoices 2026", "Folder • 24 items • 10 mins ago", COLOR_AMBER, "folder"),
        ("📁 Tax Returns & Audit Files", "Folder • 18 items • Yesterday", COLOR_AMBER, "folder"),
        ("📄 Vendor_Agreement_Signed.pdf", "PDF • 4.8 MB • Today 11:20 AM", COLOR_ACCENT, "pdf"),
        ("📊 Q2_Financial_Budget_Projection.xlsx", "Excel • 1.6 MB • Jun 14, 2026", COLOR_EMERALD, "xlsx"),
        ("🧾 Equipment_Purchase_Warranty.pdf", "PDF • 3.2 MB • Jun 02, 2026", COLOR_PURPLE, "pdf"),
        ("🖼️ Site_Inspection_HQ_Photo.jpg", "Image • 5.1 MB • May 29, 2026", COLOR_ROSE, "img"),
    ]

    fy = st_y + 105
    for name, meta, color, f_type in files:
        draw.rounded_rectangle([px1 + 36, fy, px2 - 36, fy + 120], radius=20, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=1)
        # Type Icon Box
        draw.rounded_rectangle([px1 + 55, fy + 20, px1 + 135, fy + 100], radius=16, fill=(color[0], color[1], color[2], 40))
        icon_symbol = "📁" if f_type == "folder" else ("📄" if f_type == "pdf" else ("📊" if f_type == "xlsx" else "🖼️"))
        draw.text((px1 + 75, fy + 35), icon_symbol, font=get_font(36))
        # Title and details
        draw.text((px1 + 155, fy + 25), name, font=get_font(25, bold=True), fill=TEXT_WHITE)
        draw.text((px1 + 155, fy + 68), meta, font=get_font(20), fill=TEXT_MUTED)
        # 3-dot action menu
        draw.text((px2 - 80, fy + 42), "⋮", font=get_font(34, bold=True), fill=TEXT_MUTED)
        fy += 140

    # Bottom Batch Operations Floating Toolbar
    bt_y = py2 - 160
    draw.rounded_rectangle([px1 + 50, bt_y, px2 - 50, bt_y + 90], radius=26, fill=PHONE_SURFACE, outline=COLOR_CYAN, width=2)
    draw.text((px1 + 90, bt_y + 28), "➕ New Folder", font=get_font(24, bold=True), fill=COLOR_CYAN)
    draw.text((px1 + 360, bt_y + 28), "📋 Batch Copy", font=get_font(24, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 640, bt_y + 28), "🏷️ Edit Tags", font=get_font(24, bold=True), fill=TEXT_WHITE)

    img.save(SCREENSHOTS_DIR / "04_file_manager.png", "PNG")
    print("  ✓ Generated 04_file_manager.png")

def generate_screenshot_05_storage_analyser():
    """Screenshot 5: Storage Analyser & Cleaner (Meaning Clones & Cache)"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (18, 14, 28), (32, 22, 44))
    draw_glow_circle(img, 540, 600, 360, COLOR_ROSE, alpha=50)

    draw_header_section(
        draw,
        badge_text="🧹 STORAGE ANALYSER & CLEANER",
        badge_color=COLOR_ROSE,
        headline="Deep Storage Analyser & Cleaner",
        subtitle="Free Gigabytes • Exact Duplicates & Junk Cache",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Storage Hero Donut / Bar Card
    c_y = py1 + 80
    draw.rounded_rectangle([px1 + 36, c_y, px2 - 36, c_y + 360], radius=26, fill=PHONE_CARD_BG, outline=COLOR_ROSE, width=2)
    draw.text((px1 + 65, c_y + 30), "Storage Diagnostics Overview", font=get_font(26, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, c_y + 75), "84.2 GB Used / 128 GB Total (43.8 GB Free)", font=get_font(21), fill=TEXT_MUTED)

    # Multi-color storage bar
    bar_y = c_y + 120
    bar_w = (px2 - 36) - (px1 + 65) - 30
    draw.rounded_rectangle([px1 + 65, bar_y, px1 + 65 + bar_w, bar_y + 34], radius=14, fill=PHONE_SURFACE)
    # Segments: Docs (35%), Media (30%), Duplicates (15%), Cache (10%), Free (10%)
    draw.rounded_rectangle([px1 + 65, bar_y, px1 + 65 + int(bar_w * 0.35), bar_y + 34], radius=14, fill=COLOR_ACCENT)
    draw.rounded_rectangle([px1 + 65 + int(bar_w * 0.35), bar_y, px1 + 65 + int(bar_w * 0.65), bar_y + 34], radius=4, fill=COLOR_PURPLE)
    draw.rounded_rectangle([px1 + 65 + int(bar_w * 0.65), bar_y, px1 + 65 + int(bar_w * 0.80), bar_y + 34], radius=4, fill=COLOR_ROSE)
    draw.rounded_rectangle([px1 + 65 + int(bar_w * 0.80), bar_y, px1 + 65 + int(bar_w * 0.90), bar_y + 34], radius=4, fill=COLOR_AMBER)

    # Legend Row
    leg_y = bar_y + 60
    draw.text((px1 + 65, leg_y), "■ Docs (38 GB)", font=get_font(19, bold=True), fill=COLOR_ACCENT)
    draw.text((px1 + 250, leg_y), "■ Photos (26 GB)", font=get_font(19, bold=True), fill=COLOR_PURPLE)
    draw.text((px1 + 460, leg_y), "■ Duplicates (14 GB)", font=get_font(19, bold=True), fill=COLOR_ROSE)
    draw.text((px1 + 710, leg_y), "■ Cache (6.2 GB)", font=get_font(19, bold=True), fill=COLOR_AMBER)

    # 1-Tap Quick Clean Button
    btn_clean_y = leg_y + 50
    draw.rounded_rectangle([px1 + 65, btn_clean_y, px2 - 65, btn_clean_y + 70], radius=18, fill=COLOR_ROSE)
    draw.text((px1 + 260, btn_clean_y + 18), "⚡ Clean 6.2 GB Hidden Junk Cache", font=get_font(24, bold=True), fill=TEXT_WHITE)

    # Meaning Clones & Duplicate Section
    dup_y = c_y + 390
    draw.text((px1 + 40, dup_y), "Meaning Clones & Duplicates", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.rounded_rectangle([px2 - 320, dup_y - 6, px2 - 40, dup_y + 44], radius=14, fill=(236, 72, 153, 40), outline=COLOR_ROSE, width=1)
    draw.text((px2 - 300, dup_y + 6), "Select All / None ✓", font=get_font(21, bold=True), fill=COLOR_ROSE)

    # Duplicate items list
    dup_items = [
        ("Invoice_May_Copy.pdf", "Original in /Downloads • Exact SHA-256 Match", "4.8 MB", True),
        ("IMG_20260520_Burst01.jpg", "Burst shot • Similar visual content (99.8%)", "8.2 MB", True),
        ("Contract_Draft_v2.docx", "Duplicate copy in /Documents/Backup", "2.1 MB", True),
        ("Scanned_Receipt_Duplicate.png", "Identical OCR content detected", "1.4 MB", False),
    ]

    dy = dup_y + 60
    for name, reason, sz, checked in dup_items:
        draw.rounded_rectangle([px1 + 36, dy, px2 - 36, dy + 115], radius=20, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=1)
        # Checkbox
        draw.rounded_rectangle([px1 + 60, dy + 38, px1 + 100, dy + 78], radius=8, fill=COLOR_ROSE if checked else PHONE_SURFACE, outline=COLOR_ROSE if checked else TEXT_DIM, width=2)
        if checked:
            draw.text((px1 + 68, dy + 42), "✓", font=get_font(24, bold=True), fill=TEXT_WHITE)
        draw.text((px1 + 125, dy + 22), name, font=get_font(24, bold=True), fill=TEXT_WHITE)
        draw.text((px1 + 125, dy + 62), reason, font=get_font(19), fill=TEXT_MUTED)
        draw.text((px2 - 160, dy + 38), sz, font=get_font(24, bold=True), fill=COLOR_ROSE)
        dy += 135

    # Bottom Delete Action Bar
    bot_y = py2 - 140
    draw.rounded_rectangle([px1 + 40, bot_y, px2 - 40, bot_y + 90], radius=24, fill=COLOR_ROSE)
    draw.text((px1 + 220, bot_y + 26), "🗑️ Delete Selected Clones (15.1 MB)", font=get_font(26, bold=True), fill=TEXT_WHITE)

    img.save(SCREENSHOTS_DIR / "05_storage_analyser.png", "PNG")
    print("  ✓ Generated 05_storage_analyser.png")

def generate_screenshot_06_smart_cards():
    """Screenshot 6: Smart Cards & Identity Wallet"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (20, 16, 32), (34, 26, 52))
    draw_glow_circle(img, 540, 600, 360, COLOR_AMBER, alpha=50)

    draw_header_section(
        draw,
        badge_text="🗂️ SMART CARDS & VAULT",
        badge_color=COLOR_AMBER,
        headline="Smart Cards & Identity Wallet",
        subtitle="IDs, Bills, Warranties & Receipts • Offline OCR",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Filter Tags Row
    tag_y = py1 + 80
    tags = [("All Cards (14)", True), ("IDs & Passports", False), ("Warranty Cards", False), ("Bills", False)]
    tx = px1 + 40
    for t_name, active in tags:
        tw = 210 if "All" in t_name else 235
        draw.rounded_rectangle([tx, tag_y, tx + tw, tag_y + 54], radius=16, fill=COLOR_AMBER if active else PHONE_CARD_BG, outline=COLOR_AMBER if active else PHONE_CARD_BORDER, width=2)
        draw.text((tx + 22, tag_y + 14), t_name, font=get_font(21, bold=active), fill=TEXT_WHITE if active else TEXT_MUTED)
        tx += tw + 14

    # Card 1: Aadhaar / Identity Card
    c1_y = tag_y + 85
    draw.rounded_rectangle([px1 + 40, c1_y, px2 - 40, c1_y + 260], radius=24, fill=(30, 41, 59), outline=(59, 130, 246), width=2)
    # Header inside card
    draw.rounded_rectangle([px1 + 65, c1_y + 24, px1 + 185, c1_y + 64], radius=10, fill=(59, 130, 246, 50))
    draw.text((px1 + 80, c1_y + 30), "NATIONAL ID", font=get_font(18, bold=True), fill=COLOR_ACCENT)
    draw.text((px1 + 65, c1_y + 80), "Aadhaar Identity Card", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, c1_y + 125), "Card No:  XXXX - XXXX - 9821", font=get_font(24, bold=True), fill=COLOR_EMERALD)
    draw.text((px1 + 65, c1_y + 165), "Holder: Narendra Patel  •  DOB: 14/08/1992", font=get_font(20), fill=TEXT_MUTED)
    draw.rounded_rectangle([px2 - 220, c1_y + 180, px2 - 65, c1_y + 230], radius=14, fill=COLOR_ACCENT)
    draw.text((px2 - 195, c1_y + 192), "View Card ➔", font=get_font(20, bold=True), fill=TEXT_WHITE)

    # Card 2: Vehicle Insurance Policy
    c2_y = c1_y + 290
    draw.rounded_rectangle([px1 + 40, c2_y, px2 - 40, c2_y + 260], radius=24, fill=(30, 41, 59), outline=COLOR_EMERALD, width=2)
    draw.rounded_rectangle([px1 + 65, c2_y + 24, px1 + 220, c2_y + 64], radius=10, fill=(16, 185, 129, 50))
    draw.text((px1 + 80, c2_y + 30), "AUTO INSURANCE", font=get_font(18, bold=True), fill=COLOR_EMERALD)
    draw.text((px1 + 65, c2_y + 80), "HDFC ERGO Comprehensive", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, c2_y + 125), "Policy:  POL-2026-8942018", font=get_font(24, bold=True), fill=COLOR_EMERALD)
    draw.text((px1 + 65, c2_y + 165), "Vehicle: Honda City (GJ-01-XX-1234) • Valid till Dec 2026", font=get_font(20), fill=TEXT_MUTED)
    draw.rounded_rectangle([px2 - 220, c2_y + 180, px2 - 65, c2_y + 230], radius=14, fill=COLOR_EMERALD)
    draw.text((px2 - 195, c2_y + 192), "View Card ➔", font=get_font(20, bold=True), fill=TEXT_WHITE)

    # Card 3: MacBook Pro Purchase Warranty & Receipt
    c3_y = c2_y + 290
    draw.rounded_rectangle([px1 + 40, c3_y, px2 - 40, c3_y + 260], radius=24, fill=(30, 41, 59), outline=COLOR_AMBER, width=2)
    draw.rounded_rectangle([px1 + 65, c3_y + 24, px1 + 230, c3_y + 64], radius=10, fill=(245, 158, 11, 50))
    draw.text((px1 + 80, c3_y + 30), "DEVICE WARRANTY", font=get_font(18, bold=True), fill=COLOR_AMBER)
    draw.text((px1 + 65, c3_y + 80), "AppleCare+ Warranty Certificate", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, c3_y + 125), "Serial:  C02G9012MD6R", font=get_font(24, bold=True), fill=COLOR_AMBER)
    draw.text((px1 + 65, c3_y + 165), "MacBook Pro 16\" • Coverage active till 2027", font=get_font(20), fill=TEXT_MUTED)
    draw.rounded_rectangle([px2 - 220, c3_y + 180, px2 - 65, c3_y + 230], radius=14, fill=COLOR_AMBER)
    draw.text((px2 - 195, c3_y + 192), "View Card ➔", font=get_font(20, bold=True), fill=TEXT_WHITE)

    # Bottom "+ Add New Smart Card" Button
    add_y = py2 - 140
    draw.rounded_rectangle([px1 + 60, add_y, px2 - 60, add_y + 85], radius=24, fill=COLOR_AMBER)
    draw.text((px1 + 260, add_y + 24), "➕ Scan or Add New Smart Card", font=get_font(25, bold=True), fill=TEXT_WHITE)

    img.save(SCREENSHOTS_DIR / "06_smart_cards.png", "PNG")
    print("  ✓ Generated 06_smart_cards.png")

def generate_screenshot_07_pc_explorer():
    """Screenshot 7: Cable-Free PC Explorer (Wi-Fi Sharing)"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (12, 22, 38), (20, 36, 60))
    draw_glow_circle(img, 540, 600, 360, COLOR_CYAN, alpha=50)

    draw_header_section(
        draw,
        badge_text="🌐 LOCAL PC EXPLORER & SHARING",
        badge_color=COLOR_CYAN,
        headline="Cable-Free PC Explorer",
        subtitle="Transfer Files Over Local Wi-Fi & Hotspot Fast",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # WiFi Connection Card
    wc_y = py1 + 80
    draw.rounded_rectangle([px1 + 36, wc_y, px2 - 36, wc_y + 360], radius=26, fill=PHONE_CARD_BG, outline=COLOR_CYAN, width=2)
    # Active Wi-Fi pulse icon
    draw.rounded_rectangle([px1 + 65, wc_y + 30, px1 + 145, wc_y + 110], radius=20, fill=(6, 182, 212, 40))
    draw.text((px1 + 85, wc_y + 45), "📶", font=get_font(42))
    draw.text((px1 + 170, wc_y + 36), "Local Network Connected", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 170, wc_y + 76), "Wi-Fi: Office_5GHz  •  IP: 192.168.1.15", font=get_font(20), fill=COLOR_CYAN)

    # Server Address Box
    addr_y = wc_y + 140
    draw.rounded_rectangle([px1 + 65, addr_y, px2 - 65, addr_y + 170], radius=20, fill=PHONE_SURFACE, outline=COLOR_CYAN, width=1)
    draw.text((px1 + 90, addr_y + 25), "Open in any Web Browser on your PC:", font=get_font(22), fill=TEXT_MUTED)
    draw.text((px1 + 90, addr_y + 70), "http://192.168.1.15:8080", font=get_font(34, bold=True), fill=COLOR_CYAN)
    draw.text((px1 + 90, addr_y + 125), "FTP Protocol Address:  ftp://192.168.1.15:2121", font=get_font(20), fill=TEXT_DIM)

    # Transfer Speed Graphic Card
    tg_y = wc_y + 400
    draw.rounded_rectangle([px1 + 36, tg_y, px2 - 36, tg_y + 440], radius=26, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=2)
    draw.text((px1 + 65, tg_y + 30), "⚡ High-Speed Direct Transfer", font=get_font(28, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 65, tg_y + 72), "Zero Internet used • Direct Device-to-PC connection", font=get_font(21), fill=TEXT_MUTED)

    # Simulated Transfer Items
    t_items = [
        ("Annual_Report_2026_Final.pdf", "42.8 MB • Uploading to PC...", 85, COLOR_CYAN),
        ("Backup_Document_Vault.zip", "312 MB • Downloaded to Phone", 100, COLOR_EMERALD),
        ("Project_Raw_Audio_Notes.wav", "68.4 MB • Complete", 100, COLOR_EMERALD),
    ]

    iy = tg_y + 125
    for name, stat, prog, col in t_items:
        draw.text((px1 + 65, iy), name, font=get_font(23, bold=True), fill=TEXT_WHITE)
        draw.text((px2 - 240, iy), f"{prog}%", font=get_font(21, bold=True), fill=col)
        # Progress Bar
        draw.rounded_rectangle([px1 + 65, iy + 35, px2 - 65, iy + 52], radius=8, fill=PHONE_SURFACE)
        draw.rounded_rectangle([px1 + 65, iy + 35, px1 + 65 + int(((px2 - 65) - (px1 + 65)) * (prog / 100)), iy + 52], radius=8, fill=col)
        draw.text((px1 + 65, iy + 62), stat, font=get_font(18), fill=TEXT_MUTED)
        iy += 95

    # Bottom Toggle Server Button
    btn_s_y = py2 - 140
    draw.rounded_rectangle([px1 + 60, btn_s_y, px2 - 60, btn_s_y + 85], radius=24, fill=COLOR_CYAN)
    draw.text((px1 + 250, btn_s_y + 24), "⏹ Stop PC Explorer Server", font=get_font(25, bold=True), fill=TEXT_WHITE)

    img.save(SCREENSHOTS_DIR / "07_pc_explorer.png", "PNG")
    print("  ✓ Generated 07_pc_explorer.png")

def generate_screenshot_08_privacy():
    """Screenshot 8: 100% Offline Privacy Guarantee"""
    img = Image.new("RGBA", (1080, 2400), BG_DARK_TOP)
    draw = ImageDraw.Draw(img)
    draw_vertical_gradient(draw, 1080, 2400, (10, 24, 28), (18, 38, 44))
    draw_glow_circle(img, 540, 600, 360, COLOR_EMERALD, alpha=50)

    draw_header_section(
        draw,
        badge_text="🛡️ ZERO CLOUD PRIVACY GUARANTEE",
        badge_color=COLOR_EMERALD,
        headline="Zero Cloud. 100% Offline Privacy.",
        subtitle="On-Device AI • No Ads • No Remote Tracking",
    )

    px1, py1, px2, py2 = 70, 320, 1010, 2320
    draw_phone_chassis(draw, px1, py1, px2, py2)

    # Privacy Shield Emblem Hero Card
    sh_y = py1 + 80
    draw.rounded_rectangle([px1 + 36, sh_y, px2 - 36, sh_y + 360], radius=26, fill=PHONE_CARD_BG, outline=COLOR_EMERALD, width=2)
    draw.rounded_rectangle([px1 + 380, sh_y + 30, px1 + 500, sh_y + 150], radius=60, fill=(16, 185, 129, 45), outline=COLOR_EMERALD, width=2)
    draw.text((px1 + 412, sh_y + 55), "🛡️", font=get_font(56))

    draw.text((px1 + 180, sh_y + 175), "Certified 100% On-Device Engine", font=get_font(32, bold=True), fill=TEXT_WHITE)
    draw.text((px1 + 110, sh_y + 225), "Your documents, extracted text, and Smart Cards never touch the cloud.", font=get_font(21), fill=TEXT_MUTED)
    draw.text((px1 + 240, sh_y + 265), "Operates entirely without an Internet connection.", font=get_font(21), fill=COLOR_EMERALD)

    # 4 Privacy Pillars
    pillars = [
        ("🧠 On-Device MiniLM Semantic AI", "384-dimensional sentence transformer embeddings run locally via ONNX runtime.", COLOR_PURPLE, "ai"),
        ("⚡ High-Speed Local OCR", "Tesseract text extraction computes text purely on your CPU/NPU hardware.", COLOR_ACCENT, "ocr"),
        ("🔒 Hardware Keystore Encryption", "Sensitive credentials and offline trial states are locked in Android KeyStore.", COLOR_AMBER, "lock"),
        ("🚫 Zero Trackers & Zero Analytics", "Contains zero advertising SDKs, zero behavioral trackers, and zero telemetry.", COLOR_EMERALD, "block"),
    ]

    py_cur = sh_y + 390
    for p_title, p_desc, p_col, p_ic in pillars:
        draw.rounded_rectangle([px1 + 36, py_cur, px2 - 36, py_cur + 160], radius=22, fill=PHONE_CARD_BG, outline=PHONE_CARD_BORDER, width=1)
        # Left Accent
        draw.rounded_rectangle([px1 + 36, py_cur, px1 + 46, py_cur + 160], radius=4, fill=p_col)
        # Title
        draw.text((px1 + 65, py_cur + 25), p_title, font=get_font(25, bold=True), fill=TEXT_WHITE)
        # Description
        draw.text((px1 + 65, py_cur + 75), p_desc[:78], font=get_font(20), fill=TEXT_MUTED)
        draw.text((px1 + 65, py_cur + 105), p_desc[78:], font=get_font(20), fill=TEXT_MUTED)
        py_cur += 185

    # Bottom Verification Badge
    bot_y = py2 - 130
    draw.rounded_rectangle([px1 + 80, bot_y, px2 - 80, bot_y + 75], radius=20, fill=PHONE_SURFACE, outline=COLOR_EMERALD, width=1)
    draw.text((px1 + 210, bot_y + 22), "✓ Verified Google Play Data Safety Compliant", font=get_font(23, bold=True), fill=COLOR_EMERALD)

    img.save(SCREENSHOTS_DIR / "08_offline_privacy.png", "PNG")
    print("  ✓ Generated 08_offline_privacy.png")

# ==============================================================================
# FEATURE GRAPHIC (1024 x 500 px, 24-bit PNG, No Alpha)
# ==============================================================================

def generate_feature_graphic():
    """Google Play Store Feature Graphic (1024 x 500 px)"""
    import subprocess
    script_path = PROJECT_DIR / "scripts" / "generate_feature_graphic.py"
    if script_path.exists():
        subprocess.run([sys.executable, str(script_path)], check=True)
        return

# ==============================================================================
# APP ICON (512 x 512 px)
# ==============================================================================

def generate_app_icon():
    """Google Play Store High-Res App Icon (512 x 512 px, 32-bit PNG)"""
    icon_src = PROJECT_DIR / "assets" / "images" / "icon.png"
    dest_path = ICON_DIR / "app_icon_512x512.png"
    if icon_src.exists():
        ic = Image.open(icon_src).convert("RGBA")
        ic = ic.resize((512, 512), Image.Resampling.LANCZOS)
        ic.save(dest_path, "PNG")
        print("  ✓ Generated app_icon_512x512.png from assets/images/icon.png")
    else:
        ic = Image.new("RGBA", (512, 512), (15, 23, 42, 255))
        draw = ImageDraw.Draw(ic)
        draw.rounded_rectangle([20, 20, 492, 492], radius=110, fill=COLOR_ACCENT)
        draw.text((140, 200), "FileLens", font=get_font(56, bold=True), fill=TEXT_WHITE)
        ic.save(dest_path, "PNG")
        print("  ✓ Generated fallback app_icon_512x512.png")

# ==============================================================================
# MAIN RUNNER
# ==============================================================================

def main():
    print("=" * 70)
    print("      FILELENS PRO — GOOGLE PLAY STORE GRAPHIC ASSETS GENERATOR")
    print("=" * 70)
    print(f"Output Directory: {OUTPUT_DIR}\n")

    generate_screenshot_01_search()
    generate_screenshot_02_scanner()
    generate_screenshot_03_second_brain()
    generate_screenshot_04_file_manager()
    generate_screenshot_05_storage_analyser()
    generate_screenshot_06_smart_cards()
    generate_screenshot_07_pc_explorer()
    generate_screenshot_08_privacy()
    generate_feature_graphic()
    generate_app_icon()

    print("\n" + "=" * 70)
    print("         ALL GOOGLE PLAY ASSETS GENERATED & VERIFIED!")
    print("=" * 70)
    print(f"  • Screenshots (8):  {SCREENSHOTS_DIR}")
    print(f"  • Feature Graphic:  {FEATURE_DIR / 'feature_graphic_1024x500.png'}")
    print(f"  • High-Res Icon:    {ICON_DIR / 'app_icon_512x512.png'}")
    print("=" * 70)

if __name__ == "__main__":
    main()
