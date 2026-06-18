"""
slidetok rendering engine  (rebuilt from scratch)
=================================================
Generates 9:16 (1080x1920) TikTok-ready caption slides.

Key fixes vs. the old engine:
  1. Output is ALWAYS a locked 1080x1920 (true 9:16).
  2. The font size you choose is the font size you GET. Long captions wrap
     onto more lines instead of being silently shrunk, so every slide's text
     is the same height. (Set lock_font_size=False to allow auto-shrink.)
  3. "No outline" is a real, supported choice. Any outline value of None / ""
     / "None" draws no outline at all.

This file exposes generate_slideshow(...) with the exact arguments the GUI
already passes, plus two new optional ones: font_size and lock_font_size.
"""

import os
import math
import random
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

# ---- The one place TikTok dimensions live. 9:16, locked. -------------------
CANVAS_W, CANVAS_H = 1080, 1920

# Fraction of the width the text block is allowed to use before it wraps.
TEXT_AREA_WIDTH_FRAC = 0.86
# Fraction of the height the text block tries to stay within (for warnings /
# optional shrink). Captions are vertically centered within the canvas.
TEXT_AREA_HEIGHT_FRAC = 0.80

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")

# Bundled TikTok-style default font (Montserrat Bold) used when no font is given.
DEFAULT_FONT = os.path.join(os.path.dirname(__file__), "fonts", "Montserrat-Bold.ttf")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _is_no_color(value):
    """True when a color slot means 'leave it off'."""
    if value is None:
        return True
    return str(value).strip().lower() in ("", "none")


def _norm_color(value, default=None):
    """Return a usable color string, or `default` when the slot is 'off'."""
    if _is_no_color(value):
        return default
    return str(value).strip()


def _list_images(folder):
    """All non-CTA image files in a folder, sorted for deterministic output."""
    out = []
    for name in sorted(os.listdir(folder)):
        if name.lower().endswith(IMAGE_EXTS) and "cta" not in name.lower():
            out.append(os.path.join(folder, name))
    return out


def _find_cta_image(folder):
    for name in sorted(os.listdir(folder)):
        if name.lower().endswith(IMAGE_EXTS) and "cta" in name.lower():
            return os.path.join(folder, name)
    return None


def _cover(img, w=CANVAS_W, h=CANVAS_H):
    """Resize+center-crop an image so it fills w x h with no distortion."""
    img = img.convert("RGB")
    scale = max(w / img.width, h / img.height)
    new = img.resize((math.ceil(img.width * scale), math.ceil(img.height * scale)))
    left = (new.width - w) // 2
    top = (new.height - h) // 2
    return new.crop((left, top, left + w, top + h))


def _rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def _draw_tiktok_pills(img, line_boxes, color, line_h):
    """
    Draw a separate rounded pill behind each line of text (the TikTok
    "background" caption look), stacked so adjacent lines merge into one
    continuous ribbon instead of a single big rectangle.

    line_boxes: list of (left, top, right, bottom) per text line.
    """
    pad_x = line_h * 0.42
    pad_y = line_h * 0.16
    radius = int(line_h * 0.34)
    # overlap adjacent pills vertically so they read as one connected shape
    overlap = radius

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    rgba = _to_rgba(color)

    n = len(line_boxes)
    for i, (l, t, r, b) in enumerate(line_boxes):
        top = t - pad_y - (overlap if i > 0 else 0)
        bot = b + pad_y + (overlap if i < n - 1 else 0)
        od.rounded_rectangle(
            [l - pad_x, top, r + pad_x, bot], radius=radius, fill=rgba
        )
    img.alpha_composite(overlay)


def _to_rgba(color, alpha=255):
    """Accept '#RRGGBB' (optionally with our own alpha) -> (r,g,b,a)."""
    c = str(color).lstrip("#")
    r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return (r, g, b, alpha)


# ---------------------------------------------------------------------------
# Text layout — the part that makes every slide's text the same size
# ---------------------------------------------------------------------------
def _wrap_tokens(words, font, max_width, draw):
    """
    Word-wrap a list of (word, is_bubble) tokens into lines that each fit
    within max_width. Returns a list of lines; each line is a list of tokens.
    Never changes the font size.
    """
    space_w = draw.textlength(" ", font=font)
    lines, cur, cur_w = [], [], 0.0
    for word, is_bubble in words:
        w = draw.textlength(word, font=font)
        add = w if not cur else w + space_w
        if cur and cur_w + add > max_width:
            lines.append(cur)
            cur, cur_w = [(word, is_bubble)], w
        else:
            cur.append((word, is_bubble))
            cur_w += add
    if cur:
        lines.append(cur)
    return lines, space_w


def _tokenize(caption, bubble_words):
    bubble_set = {w.strip().lower() for w in (bubble_words or []) if w.strip()}
    tokens = []
    for word in str(caption).split():
        key = "".join(ch for ch in word.lower() if ch.isalnum())
        tokens.append((word, key in bubble_set))
    return tokens


def _draw_caption(
    img,
    caption,
    font_path,
    font_size,
    text_color,
    outline_color,
    bubble_color,
    bubble_words,
    bw_text_color,
    bw_fill_color,
    lock_font_size=True,
    outline_width=6,
    vertical_align="center",
):
    """Draw one caption onto a 1080x1920 image and return it."""
    img = img.convert("RGBA")
    draw = ImageDraw.Draw(img)
    max_text_w = CANVAS_W * TEXT_AREA_WIDTH_FRAC
    max_text_h = CANVAS_H * TEXT_AREA_HEIGHT_FRAC

    size = int(font_size)
    while True:
        font = ImageFont.truetype(font_path, size)
        ascent, descent = font.getmetrics()
        line_h = ascent + descent
        line_gap = int(line_h * 0.25)

        tokens = _tokenize(caption, bubble_words)
        lines, space_w = _wrap_tokens(tokens, font, max_text_w, draw)
        block_h = len(lines) * line_h + (len(lines) - 1) * line_gap

        # If we're locking the size (the default + the fix you asked for), we
        # stop here no matter what. Only shrink when explicitly allowed.
        if lock_font_size or block_h <= max_text_h or size <= 14:
            if block_h > max_text_h and lock_font_size:
                print(f"  [note] caption is tall and may run long: {caption[:40]!r}")
            break
        size -= 2  # auto-fit mode only

    # measure each line's pixel width so we can center it
    line_widths = []
    for line in lines:
        w = sum(draw.textlength(word, font=font) for word, _ in line)
        w += space_w * (len(line) - 1)
        line_widths.append(w)

    if vertical_align == "top":
        start_y = CANVAS_H * 0.10
    elif vertical_align == "bottom":
        start_y = CANVAS_H - (CANVAS_H * 0.10) - block_h
    else:
        start_y = (CANVAS_H - block_h) / 2

    text_color = _norm_color(text_color, "#FFFFFF")
    outline_color = _norm_color(outline_color, None)      # None => no outline
    bubble_color = _norm_color(bubble_color, None)        # None => no panel
    bw_text_color = _norm_color(bw_text_color, text_color)
    bw_fill_color = _norm_color(bw_fill_color, None)

    # TikTok-style "bubble": a rounded pill behind EACH line, stacked into one
    # ribbon, instead of a single rectangle around the whole block.
    if bubble_color:
        line_boxes = []
        for i, lw in enumerate(line_widths):
            top = start_y + i * (line_h + line_gap)
            left = (CANVAS_W - lw) / 2
            line_boxes.append((left, top, left + lw, top + line_h))
        _draw_tiktok_pills(img, line_boxes, bubble_color, line_h)

    # draw line by line, word by word (so individual words can be highlighted)
    y = start_y
    for line, lw in zip(lines, line_widths):
        x = (CANVAS_W - lw) / 2
        for word, is_bubble in line:
            w = draw.textlength(word, font=font)
            if is_bubble and bw_fill_color:
                pad_x, pad_y = int(line_h * 0.12), int(line_h * 0.06)
                _rounded_rect(
                    draw,
                    [x - pad_x, y - pad_y, x + w + pad_x, y + line_h + pad_y],
                    radius=int(line_h * 0.18),
                    fill=bw_fill_color,
                )
            fill = bw_text_color if is_bubble else text_color
            if outline_color:
                draw.text(
                    (x, y), word, font=font, fill=fill,
                    stroke_width=outline_width, stroke_fill=outline_color,
                )
            else:
                draw.text((x, y), word, font=font, fill=fill)
            x += w + space_w
        y += line_h + line_gap

    return img.convert("RGB")


# ---------------------------------------------------------------------------
# Public entry point — matches what the GUI already calls
# ---------------------------------------------------------------------------
def generate_slideshow(
    csv_path,
    bg_folder,
    font_path,
    output_folder,
    num_posts,
    cta_slide=None,
    bubble_words=None,
    bubble_color_list=None,
    text_color_list=None,
    outline_color_list=None,
    bubble_word_text_color="#000000",
    bubble_word_fill_color="#FFFFFF",
    font_size=45,           # NEW: the size you pick is respected
    lock_font_size=True,    # NEW: keep text the same size across slides
    random_backgrounds=True,  # NEW: pick distinct random images per show
):
    bubble_color_list = bubble_color_list or []
    text_color_list = text_color_list or []
    outline_color_list = outline_color_list or []

    # No font supplied -> use the bundled TikTok-style default (Montserrat).
    if not font_path or not os.path.exists(str(font_path)):
        font_path = DEFAULT_FONT

    # --- read captions: each ROW = one post, each COLUMN = one slide ---
    low = str(csv_path).lower()
    if low.endswith(".ods"):
        df = pd.read_excel(csv_path, engine="odf", header=None)
    elif low.endswith((".xlsx", ".xlsm")):
        df = pd.read_excel(csv_path, engine="openpyxl", header=None)
    else:
        df = pd.read_csv(csv_path, header=None)

    backgrounds = _list_images(bg_folder)
    if not backgrounds:
        raise ValueError("No background images found in the background folder.")
    cta_path = _find_cta_image(bg_folder)

    os.makedirs(output_folder, exist_ok=True)
    n_rows = len(df)
    if n_rows == 0:
        raise ValueError("The captions file is empty.")
    total = max(1, int(num_posts))
    seq_i = 0  # used only for non-random (in-order) cycling
    made = 0

    for i in range(total):
        # cycle through caption rows if more shows are requested than rows exist
        r = i % n_rows
        post_dir = os.path.join(output_folder, f"post_{i + 1:02d}")
        os.makedirs(post_dir, exist_ok=True)

        # the non-empty captions for this show, keeping their column index
        # (column index drives the per-slide colors)
        show_slides = []
        for c in range(df.shape[1]):
            cell = df.iat[r, c]
            caption = "" if pd.isna(cell) else str(cell).strip()
            if caption:
                show_slides.append((c, caption))
        needed = len(show_slides)
        if needed == 0:
            continue

        # choose this show's background images
        if random_backgrounds:
            if needed <= len(backgrounds):
                # distinct + randomly ordered: never the same image twice in a show
                chosen = random.sample(backgrounds, needed)
            else:
                # fewer images than slides -> allow repeats, but shuffled
                chosen = [random.choice(backgrounds) for _ in range(needed)]
                print(f"  [note] only {len(backgrounds)} images for {needed} slides; repeats used.")
        else:
            chosen = [backgrounds[(seq_i + k) % len(backgrounds)] for k in range(needed)]
            seq_i += needed

        slide_num = 0
        for idx, (c, caption) in enumerate(show_slides):
            slide_num += 1

            # CTA slide: insert the CTA image at the chosen position
            if cta_slide and slide_num == int(cta_slide) and cta_path:
                base = _cover(Image.open(cta_path))
                base.save(os.path.join(post_dir, f"slide_{slide_num}.png"))
                slide_num += 1

            base = _cover(Image.open(chosen[idx]))
            base = _draw_caption(
                base,
                caption=caption,
                font_path=font_path,
                font_size=font_size,
                text_color=text_color_list[c] if c < len(text_color_list) else "#FFFFFF",
                outline_color=outline_color_list[c] if c < len(outline_color_list) else None,
                bubble_color=bubble_color_list[c] if c < len(bubble_color_list) else None,
                bubble_words=bubble_words,
                bw_text_color=bubble_word_text_color,
                bw_fill_color=bubble_word_fill_color,
                lock_font_size=lock_font_size,
            )
            base.save(os.path.join(post_dir, f"slide_{slide_num}.png"))
            made += 1

    print(f"Done. Generated {made} slides across {total} slideshow(s) in {output_folder}")
    return output_folder
