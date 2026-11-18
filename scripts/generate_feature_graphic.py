import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT_DIR = Path(r"c:\Users\admin\Documents\Antigravity\FileLensProComplete")
OUT_PATH = ROOT_DIR / "play_store_assets" / "feature_graphic" / "feature_graphic_1024x500.png"
ICON_PATH = ROOT_DIR / "assets" / "images" / "icon.png"

CANVAS_W = 1024
CANVAS_H = 500

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

def draw_radial_glow(canvas_rgba, cx, cy, radius, color_rgb, max_alpha=80):
    glow = Image.new("RGBA", (radius * 2, radius * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for r in range(radius, 0, -4):
        alpha = int(max_alpha * (1.0 - (r / radius) ** 1.5))
        draw.ellipse(
            [(radius - r, radius - r), (radius + r, radius + r)],
            fill=(color_rgb[0], color_rgb[1], color_rgb[2], alpha)
        )
    glow = glow.filter(ImageFilter.GaussianBlur(12))
    canvas_rgba.paste(glow, (cx - radius, cy - radius), glow)

def generate():
    # 1. Base Dark Deep Slate Gradient
    base = Image.new("RGB", (CANVAS_W, CANVAS_H), (10, 15, 29))
    draw = ImageDraw.Draw(base)
    for y in range(CANVAS_H):
        ratio = y / float(CANVAS_H)
        r = int(10 + (15 - 10) * ratio)
        g = int(16 + (28 - 16) * ratio)
        b = int(30 + (50 - 30) * ratio)
        draw.line([(0, y), (CANVAS_W, y)], fill=(r, g, b))

    # 2. Atmospheric Ambient Glows
    canvas = base.convert("RGBA")
    draw_radial_glow(canvas, 180, 210, 240, (14, 165, 233), max_alpha=90)   # Sky Blue glow
    draw_radial_glow(canvas, 880, 180, 260, (16, 185, 129), max_alpha=70)   # Emerald glow
    draw_radial_glow(canvas, 550, 420, 220, (99, 102, 241), max_alpha=55)   # Indigo glow

    # 3. Top Decorative Tech Mesh & Accent Line
    overlay = ImageDraw.Draw(canvas)
    # Subtle top accent gradient bar
    for x in range(CANVAS_W):
        ratio = x / float(CANVAS_W)
        if ratio < 0.5:
            pr = ratio * 2
            col = (int(56 + (14 - 56) * pr), int(189 + (165 - 189) * pr), int(248 + (233 - 248) * pr), 220)
        else:
            pr = (ratio - 0.5) * 2
            col = (int(14 + (16 - 14) * pr), int(165 + (185 - 165) * pr), int(233 + (129 - 233) * pr), 220)
        overlay.line([(x, 0), (x, 3)], fill=col)

    # 4. App Icon Branding (Left side: 150x150 squircle with glossy shadow)
    if ICON_PATH.exists():
        icon_img = Image.open(ICON_PATH).convert("RGBA")
        icon_size = 148
        icon_img = icon_img.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        
        # Soft shadow behind icon
        icon_x = 64
        icon_y = 120
        shadow = Image.new("RGBA", (icon_size + 30, icon_size + 30), (0, 0, 0, 0))
        s_draw = ImageDraw.Draw(shadow)
        s_draw.rounded_rectangle([6, 6, icon_size + 24, icon_size + 24], radius=38, fill=(0, 0, 0, 140))
        shadow = shadow.filter(ImageFilter.GaussianBlur(10))
        canvas.paste(shadow, (icon_x - 15, icon_y - 10), shadow)

        # Squircle mask for icon
        mask = Image.new("L", (icon_size, icon_size), 0)
        m_draw = ImageDraw.Draw(mask)
        m_draw.rounded_rectangle([0, 0, icon_size, icon_size], radius=34, fill=255)
        canvas.paste(icon_img, (icon_x, icon_y), mask)

        # Subtle crisp ring around icon
        overlay.rounded_rectangle(
            [icon_x - 1, icon_y - 1, icon_x + icon_size + 1, icon_y + icon_size + 1],
            radius=35,
            outline=(255, 255, 255, 60),
            width=2
        )

    # 5. Central Branding & Titles
    text_x = 246

    # Row 1: Brand Name + PRO Badge + Version Pill
    f_brand = get_font(54, bold=True)
    f_badge = get_font(18, bold=True)
    f_sub = get_font(27, bold=True)
    f_desc = get_font(20, bold=False)

    overlay.text((text_x, 108), "FileLens Pro", font=f_brand, fill=(255, 255, 255, 255))
    
    # "PRO" glowing badge next to title
    brand_bbox = f_brand.getbbox("FileLens Pro")
    brand_w = brand_bbox[2] - brand_bbox[0]
    pro_x = text_x + brand_w + 16
    pro_y = 118
    overlay.rounded_rectangle([pro_x, pro_y, pro_x + 62, pro_y + 30], radius=8, fill=(2, 132, 199, 240), outline=(56, 189, 248, 255), width=2)
    overlay.text((pro_x + 13, pro_y + 4), "PRO", font=f_badge, fill=(255, 255, 255, 255))

    # Version 2.0 Pill
    ver_x = pro_x + 74
    overlay.rounded_rectangle([ver_x, pro_y, ver_x + 78, pro_y + 30], radius=8, fill=(16, 185, 129, 240), outline=(52, 211, 153, 255), width=2)
    overlay.text((ver_x + 12, pro_y + 4), "v2.0.0", font=f_badge, fill=(255, 255, 255, 255))

    # Row 2: Headline
    overlay.text((text_x, 178), "Offline Document Intelligence & Storage Suite", font=f_sub, fill=(56, 189, 248, 255))

    # Row 3: Subtitle / Value Proposition
    overlay.text((text_x, 224), "100% On-Device AI  •  Sub-Second Offline Search  •  Zero Cloud Uploads", font=f_desc, fill=(203, 213, 225, 255))

    # 6. Feature Highlights Pill Row (Bottom area: y=360 to 415)
    # 5 clean, compact badges with generous safe margin (>80px) on left and right
    pill_items = [
        ("OFFLINE SEARCH", (56, 189, 248)),     # Sky Blue
        ("DOC SCANNER", (52, 211, 153)),        # Emerald
        ("SECOND BRAIN", (167, 139, 250)),      # Purple
        ("FILE MANAGER", (56, 189, 248)),       # Cyan
        ("ZERO CLOUD", (244, 114, 182)),        # Pink
    ]

    f_pill = get_font(15, bold=True)
    
    # Calculate widths
    pills_data = []
    total_pills_width = 0
    padding_x = 16
    dot_space = 14
    for label, col in pill_items:
        bbox = f_pill.getbbox(label)
        text_w = bbox[2] - bbox[0]
        pill_w = text_w + padding_x * 2 + dot_space
        pills_data.append((label, col, pill_w, text_w))
        total_pills_width += pill_w
    
    spacing = 14
    total_row_width = total_pills_width + spacing * (len(pill_items) - 1)
    
    # Generous, perfectly centered horizontal margin
    start_x = (CANVAS_W - total_row_width) // 2
    pill_y = 370
    pill_h = 46

    for label, col, pw, tw in pills_data:
        # Background card
        overlay.rounded_rectangle(
            [start_x, pill_y, start_x + pw, pill_y + pill_h],
            radius=12,
            fill=(18, 28, 48, 220),
            outline=(col[0], col[1], col[2], 200),
            width=2
        )
        
        # Color dot indicator
        dot_r = 4.0
        dot_cx = start_x + padding_x
        dot_cy = pill_y + pill_h // 2
        overlay.ellipse(
            [(dot_cx - dot_r, dot_cy - dot_r), (dot_cx + dot_r, dot_cy + dot_r)],
            fill=(col[0], col[1], col[2], 255)
        )
        
        # Text label
        overlay.text(
            (dot_cx + dot_r + 8, pill_y + 12),
            label,
            font=f_pill,
            fill=(241, 245, 249, 255)
        )
        start_x += pw + spacing

    # 7. Convert to RGB (No alpha channel, strictly 24-bit per Google Play Store spec)
    final_img = canvas.convert("RGB")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    final_img.save(OUT_PATH, "PNG", optimize=True)
    print(f"Successfully generated: {OUT_PATH} ({os.path.getsize(OUT_PATH)} bytes)")

if __name__ == "__main__":
    generate()
