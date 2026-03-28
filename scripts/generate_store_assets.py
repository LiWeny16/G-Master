import os
from PIL import Image, ImageDraw, ImageFont

# Define target directory
OUTPUT_DIR = os.path.join("public", "store")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# G-Master Theme Colors
BG_COLOR = (42, 40, 38)     # Dark brownish grey
ACCENT_COLOR = (235, 222, 203) # Warm light beige
TEXT_COLOR = (255, 255, 255) # White
BORDER_COLOR = (100, 100, 100)

ASSETS = [
    {"name": "extension_icon_128.png", "width": 128, "height": 128, "text": "G-Master\n128x128"},
    {"name": "extension_icon_300.png", "width": 300, "height": 300, "text": "G-Master\n300x300"},
    {"name": "small_promo_tile.png", "width": 440, "height": 280, "text": "G-Master\nSmall Promo\n440x280"},
    {"name": "large_promo_tile.png", "width": 1400, "height": 560, "text": "G-MASTER\nADVANCED AI CONFIGURATION\nUnlock Unprecedented AI Control.\n1400x560"},
    {"name": "screenshot_1.png", "width": 1280, "height": 800, "text": "Settings & Loops Configuration\n1280x800"},
    {"name": "screenshot_2.png", "width": 1280, "height": 800, "text": "Deep Think execution\n1280x800"},
    {"name": "screenshot_3.png", "width": 1280, "height": 800, "text": "Context Window Monitor\n1280x800"},
    {"name": "screenshot_4.png", "width": 1280, "height": 800, "text": "Performance Comparison Chart\n1280x800"},
]

def generate_image(asset):
    width = asset["width"]
    height = asset["height"]
    text = asset["text"]
    filename = asset["name"]
    
    # Create new image with background
    img = Image.new('RGB', (width, height), color=BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    # Draw a fancy border
    border_width = max(2, int(width * 0.01))
    draw.rectangle([border_width, border_width, width-border_width, height-border_width], outline=ACCENT_COLOR, width=border_width)
    
    # Advanced logic for text drawing (centering without exact font size calculation)
    try:
        # Try to use a sensible font, adjust size heuristically
        font_size = max(16, int(width / (max(len(line) for line in text.split('\n')) * 0.6)))
        font = ImageFont.truetype("arial.ttf", font_size)
    except IOError:
        font = ImageFont.load_default()

    # Calculate text bounding box
    bbox = draw.multiline_textbbox((0, 0), text, font=font, align="center")
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # Center text
    x = (width - text_width) / 2
    y = (height - text_height) / 2
    
    # Draw text shadow/outline
    shadow_offset = 2
    draw.multiline_text((x+shadow_offset, y+shadow_offset), text, font=font, fill=(0,0,0), align="center")
    draw.multiline_text((x, y), text, font=font, fill=TEXT_COLOR, align="center")
    
    # Save image
    output_path = os.path.join(OUTPUT_DIR, filename)
    img.save(output_path)
    print(f"Generated: {output_path} ({width}x{height})")

if __name__ == "__main__":
    print("Generating Store Assets...")
    for asset in ASSETS:
        generate_image(asset)
    print("Done!")
