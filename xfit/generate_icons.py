"""Generate Tailor-X app icons with a professional design."""
from PIL import Image, ImageDraw, ImageFont
import math
import os

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")

# Brand colors
NAVY = (11, 29, 46)        # #0B1D2E
TEAL = (0, 200, 180)       # #00C8B4 accent
WHITE = (255, 255, 255)
GOLD = (218, 175, 95)      # #DAAF5F warm accent
LIGHT_NAVY = (20, 50, 80)


def draw_rounded_rect(draw, xy, radius, fill):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.pieslice([x0, y0, x0 + 2 * radius, y0 + 2 * radius], 180, 270, fill=fill)
    draw.pieslice([x1 - 2 * radius, y0, x1, y0 + 2 * radius], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2 * radius, x0 + 2 * radius, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2 * radius, y1 - 2 * radius, x1, y1], 0, 90, fill=fill)


def draw_measuring_tape_curve(draw, cx, cy, size, color, width=3):
    """Draw a curved measuring tape element."""
    # Draw a stylized curved tape wrapping around
    points = []
    for angle in range(120, 310, 2):
        rad = math.radians(angle)
        r = size * 0.38
        x = cx + r * math.cos(rad)
        y = cy + r * math.sin(rad)
        points.append((x, y))
    
    # Draw the tape as a thick curve
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=color, width=width)
    
    # Draw tick marks along the tape
    for i, angle in enumerate(range(130, 300, 12)):
        rad = math.radians(angle)
        r_inner = size * 0.34
        r_outer = size * 0.38 if i % 3 == 0 else size * 0.36
        x1 = cx + r_inner * math.cos(rad)
        y1 = cy + r_inner * math.sin(rad)
        x2 = cx + r_outer * math.cos(rad)
        y2 = cy + r_outer * math.sin(rad)
        tick_width = 2 if i % 3 == 0 else 1
        draw.line([(x1, y1), (x2, y2)], fill=color, width=tick_width)


def draw_body_silhouette(draw, cx, cy, size, color):
    """Draw a minimal body silhouette."""
    s = size * 0.22
    # Head
    head_r = s * 0.22
    draw.ellipse(
        [cx - head_r, cy - s * 0.85 - head_r, cx + head_r, cy - s * 0.85 + head_r],
        fill=color
    )
    # Body (simple tapered shape)
    body_points = [
        (cx - s * 0.35, cy - s * 0.55),  # left shoulder
        (cx + s * 0.35, cy - s * 0.55),  # right shoulder
        (cx + s * 0.25, cy + s * 0.1),   # right waist
        (cx + s * 0.32, cy + s * 0.85),  # right hip
        (cx - s * 0.32, cy + s * 0.85),  # left hip
        (cx - s * 0.25, cy + s * 0.1),   # left waist
    ]
    draw.polygon(body_points, fill=color)


def generate_icon(size, filename, include_bg_radius=True):
    """Generate icon at specified size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx, cy = size // 2, size // 2
    
    # Background
    if include_bg_radius:
        radius = int(size * 0.18)
        draw_rounded_rect(draw, (0, 0, size - 1, size - 1), radius, NAVY)
    else:
        draw.rectangle([0, 0, size, size], fill=NAVY)
    
    # Subtle gradient effect - lighter area in center-top
    for i in range(int(size * 0.3)):
        alpha = int(8 * (1 - i / (size * 0.3)))
        if alpha > 0:
            r = size * 0.4 - i
            if r > 0:
                draw.ellipse(
                    [cx - r, cy * 0.6 - r, cx + r, cy * 0.6 + r],
                    fill=(255, 255, 255, alpha)
                )
    
    # Draw measuring tape curve
    tape_width = max(3, size // 100)
    draw_measuring_tape_curve(draw, cx, cy * 0.95, size, TEAL, width=tape_width)
    
    # Draw body silhouette (subtle, behind text)
    body_color = (0, 200, 180, 40)  # very subtle teal
    # Use a separate layer for transparency
    body_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body_draw = ImageDraw.Draw(body_layer)
    draw_body_silhouette(body_draw, cx, cy * 0.92, size, body_color)
    img = Image.alpha_composite(img, body_layer)
    draw = ImageDraw.Draw(img)
    
    # Main text "TX" - bold and prominent
    font_size = int(size * 0.38)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
        font_small = ImageFont.truetype("arial.ttf", int(size * 0.09))
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("C:\\Windows\\Fonts\\arialbd.ttf", font_size)
            font_small = ImageFont.truetype("C:\\Windows\\Fonts\\arial.ttf", int(size * 0.09))
        except (OSError, IOError):
            font = ImageFont.load_default()
            font_small = font
    
    # Draw "T" in white and "X" in teal
    text = "TX"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    text_x = cx - tw // 2
    text_y = cy - th // 2 - size * 0.02
    
    # Get individual letter widths
    t_bbox = draw.textbbox((0, 0), "T", font=font)
    t_width = t_bbox[2] - t_bbox[0]
    
    # Draw "T" in white
    draw.text((text_x, text_y), "T", fill=WHITE, font=font)
    
    # Draw "X" in teal with slight offset
    x_offset = t_width + size * 0.01
    draw.text((text_x + x_offset, text_y), "X", fill=TEAL, font=font)
    
    # Subtle tagline below
    tag = "TAILOR-X"
    tag_bbox = draw.textbbox((0, 0), tag, font=font_small)
    tag_w = tag_bbox[2] - tag_bbox[0]
    tag_y = text_y + th + size * 0.03
    draw.text((cx - tag_w // 2, tag_y), tag, fill=(255, 255, 255, 180), font=font_small)
    
    # Small accent line under tagline
    line_w = size * 0.2
    line_y = tag_y + int(size * 0.11)
    draw.line(
        [(cx - line_w, line_y), (cx + line_w, line_y)],
        fill=TEAL, width=max(2, size // 200)
    )
    
    return img


def generate_adaptive_icon(size):
    """Generate adaptive icon (foreground only, no rounded corners)."""
    # Adaptive icons have safe zone - content should be in center 66%
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    cx, cy = size // 2, size // 2
    inner = int(size * 0.66)
    offset = (size - inner) // 2
    
    # Draw measuring tape curve (centered, slightly smaller)
    tape_width = max(3, size // 120)
    draw_measuring_tape_curve(draw, cx, cy * 0.95, inner, TEAL, width=tape_width)
    
    # Body silhouette layer
    body_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body_draw = ImageDraw.Draw(body_layer)
    draw_body_silhouette(body_draw, cx, cy * 0.92, inner, (0, 200, 180, 40))
    img = Image.alpha_composite(img, body_layer)
    draw = ImageDraw.Draw(img)
    
    # "TX" text
    font_size = int(inner * 0.38)
    try:
        font = ImageFont.truetype("C:\\Windows\\Fonts\\arialbd.ttf", font_size)
        font_small = ImageFont.truetype("C:\\Windows\\Fonts\\arial.ttf", int(inner * 0.09))
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
            font_small = ImageFont.truetype("arial.ttf", int(inner * 0.09))
        except (OSError, IOError):
            font = ImageFont.load_default()
            font_small = font
    
    text = "TX"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    text_x = cx - tw // 2
    text_y = cy - th // 2 - size * 0.02
    
    t_bbox = draw.textbbox((0, 0), "T", font=font)
    t_width = t_bbox[2] - t_bbox[0]
    
    draw.text((text_x, text_y), "T", fill=WHITE, font=font)
    draw.text((text_x + t_width + size * 0.005, text_y), "X", fill=TEAL, font=font)
    
    # Tagline
    tag = "TAILOR-X"
    tag_bbox = draw.textbbox((0, 0), tag, font=font_small)
    tag_w = tag_bbox[2] - tag_bbox[0]
    tag_y = text_y + th + size * 0.025
    draw.text((cx - tag_w // 2, tag_y), tag, fill=(255, 255, 255, 180), font=font_small)
    
    # Accent line
    line_w = inner * 0.18
    line_y = tag_y + int(inner * 0.11)
    draw.line(
        [(cx - line_w, line_y), (cx + line_w, line_y)],
        fill=TEAL, width=max(2, size // 250)
    )
    
    return img


def main():
    print("Generating Tailor-X app icons...")
    
    # icon.png - 1024x1024 main app icon
    icon = generate_icon(1024, "icon.png")
    icon.save(os.path.join(ASSETS_DIR, "icon.png"), "PNG")
    print("  ✓ icon.png (1024x1024)")
    
    # adaptive-icon.png - 1024x1024 foreground for Android adaptive icons
    adaptive = generate_adaptive_icon(1024)
    # Create with navy background for the foreground layer
    adaptive_bg = Image.new("RGBA", (1024, 1024), NAVY)
    adaptive_final = Image.alpha_composite(adaptive_bg, adaptive)
    adaptive_final.save(os.path.join(ASSETS_DIR, "adaptive-icon.png"), "PNG")
    print("  ✓ adaptive-icon.png (1024x1024)")
    
    # favicon.png - 48x48
    favicon = generate_icon(48, "favicon.png", include_bg_radius=False)
    favicon.save(os.path.join(ASSETS_DIR, "favicon.png"), "PNG")
    print("  ✓ favicon.png (48x48)")
    
    # splash-icon.png - 512x512 for splash screen
    splash = generate_adaptive_icon(512)
    splash_bg = Image.new("RGBA", (512, 512), NAVY)
    splash_final = Image.alpha_composite(splash_bg, splash)
    splash_final.save(os.path.join(ASSETS_DIR, "splash-icon.png"), "PNG")
    print("  ✓ splash-icon.png (512x512)")
    
    print("\nAll icons generated successfully!")
    print(f"Output directory: {ASSETS_DIR}")


if __name__ == "__main__":
    main()
