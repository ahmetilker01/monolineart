"""
SandArtGUI.py
=============
Tkinter GUI front-end for SandArt.py.

Layout (left-to-right):
  [Controls]  |  [Edge/Contour Preview]  |  [.thr Path Preview]

Run:
    python SandArtGUI.py
"""

import hashlib
import json
import math
import os
import sys
import threading
import time
import tkinter as tk
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import numpy as np

# Try PIL for edge-image display; fall back to pure-canvas rendering
try:
    from PIL import Image, ImageTk, ImageOps, ImageDraw
    HAS_PIL = True
except ImportError:
    Image = ImageTk = ImageOps = ImageDraw = None
    HAS_PIL = False

if os.path.dirname(__file__) not in sys.path:
    sys.path.insert(0, os.path.dirname(__file__))

import SandArt as core


# ─────────────────────────────────────────────────────────────────────────────
# App config — remembers the Pokemon folder between sessions
# ─────────────────────────────────────────────────────────────────────────────
_CONFIG_FILE = Path(__file__).parent / "config.json"


def _load_config() -> dict:
    try:
        if _CONFIG_FILE.exists():
            with open(_CONFIG_FILE, "r", encoding="utf-8") as fh:
                return json.load(fh)
    except Exception:
        pass
    return {}


def _save_config(updates: dict):
    config = _load_config()
    config.update(updates)
    try:
        with open(_CONFIG_FILE, "w", encoding="utf-8") as fh:
            json.dump(config, fh, indent=2)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Per-image settings history — written whenever the user confirms a variant in the picker
# ─────────────────────────────────────────────────────────────────────────────
_SETTINGS_HISTORY_FILE = Path(__file__).parent / "settings_history.json"


def _load_settings_history() -> dict:
    """Return the full history dict (keyed by image filename stem)."""
    try:
        if _SETTINGS_HISTORY_FILE.exists():
            with open(_SETTINGS_HISTORY_FILE, "r", encoding="utf-8") as fh:
                return json.load(fh)
    except Exception:
        pass
    return {}


def _save_settings_history(image_path: str, params: dict, label: str):
    """Upsert one entry in the history file, keyed by the image's filename stem."""
    stem    = Path(image_path).stem
    history = _load_settings_history()
    history[stem] = {
        "blur":       params.get("blur"),
        "canny_low":  params.get("canny_low"),
        "canny_high": params.get("canny_high"),
        "smooth":     params.get("smooth"),
        "min_length": params.get("min_length"),
        "min_area":   params.get("min_area"),
        "label":      label,
        "chosen_at":  datetime.now().isoformat(timespec="seconds"),
    }
    try:
        with open(_SETTINGS_HISTORY_FILE, "w", encoding="utf-8") as fh:
            json.dump(history, fh, indent=2)
    except Exception:
        pass


# Colours & constants
# ─────────────────────────────────────────────────────────────────────────────
SAND_BG      = "#f5e6c8"
BALL_COLOUR  = "#8b5e3c"
CONTOUR_COL  = "#cc6600"
PATH_COL     = "#5c3317"
CIRCLE_COL   = "#b09070"
CANVAS_SIZE  = 380          # square canvas width/height in pixels
CTRL_W       = 270          # controls panel width
CENTER_START_RHO   = 0.001  # tiny non-zero rho to avoid ambiguous true-center heading
CENTER_START_THETA = -math.pi / 2  # fixed start direction: machine "bottom"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}
PREVIEW_EXPORT_SIZE = 900

# Tooltip text for each advanced setting
TIPS = {
    "Blur": (
        "Gaussian blur strength applied to the image before edge detection.\n\n"
        "Higher = smoother edges, fewer fine details detected.\n"
        "Lower = sharper, noisier edges.\n\n"
        "Good range: 1–5 for clean images, 7–15 for noisy photos."
    ),
    "Canny Low": (
        "Lower hysteresis threshold for Canny edge detection (Edges mode only).\n\n"
        "Edges with gradient strength above this value are kept IF they\n"
        "connect to a strong edge. Lower = more edges kept.\n\n"
        "Good range: 20–80."
    ),
    "Canny High": (
        "Upper hysteresis threshold for Canny edge detection (Edges mode only).\n\n"
        "Edges with gradient strength above this are always kept (strong edges).\n"
        "Higher = only the most prominent edges survive.\n\n"
        "Good range: 100–200. Should be ~2-3x the Canny Low value."
    ),
    "Threshold": (
        "Brightness cutoff for Threshold mode.\n\n"
        "Pixels darker than this value are treated as 'draw' (with Invert on).\n"
        "Only used when Mode is set to 'threshold'.\n\n"
        "Good range: 100–180 for typical images."
    ),
    "Min Area": (
        "Minimum contour area in pixels² to include.\n\n"
        "Filters out tiny specks and noise that would create short, ugly\n"
        "scribbles in the sand. Higher = only keep large shapes.\n\n"
        "Good range: 5–30 for most images. Increase if you see noise dots."
    ),
    "Min Length": (
        "Minimum contour perimeter (line length) in pixels to include.\n\n"
        "Filters out tiny specks and dots that the machine would have to\n"
        "travel across undrawn sand to reach — not worth the trip for a\n"
        "single speck that barely shows.\n\n"
        "0 = no filtering (keep everything).\n"
        "20 = remove specks shorter than ~20 px.\n"
        "50 = only keep contours with meaningful line length.\n"
        "100+ = aggressive — only substantial features survive.\n\n"
        "Unlike Min Area (which measures enclosed area), this measures\n"
        "the actual drawn line length, so it catches open edge fragments too."
    ),
    "Smoothing": (
        "Reduces contours to their essential vertices using Douglas-Peucker\n"
        "simplification. Dozens of noisy micro-segments get collapsed into\n"
        "single clean straight lines between key points.\n\n"
        "0 = no simplification (raw pixel-level contours).\n"
        "1 = very light (1px tolerance).\n"
        "5 = moderate — good default. Removes stair-steps.\n"
        "15 = aggressive — only major shape features remain.\n"
        "25 = very aggressive.\n\n"
        "Think of it as: how many pixels of deviation is acceptable\n"
        "before a new vertex is needed?"
    ),
    "Invert threshold": (
        "When ON (default): dark pixels on a light background are detected\n"
        "(e.g. black lines on white paper — most drawings/logos).\n\n"
        "When OFF: light pixels on a dark background are detected\n"
        "(e.g. white text on black background)."
    ),
    "Mode": (
        "Edges: Uses Canny edge detection to find outlines and boundaries.\n"
        "Best for photos, detailed images, and anything with clear contrast.\n\n"
        "Threshold: Converts the image to black & white and traces the boundary\n"
        "of each dark region. Best for logos, simple silhouettes, clipart."
    ),
    "Engine": (
        "Choose which conversion engine the GUI uses.\n\n"
        "SandArt (current): unified production engine.\n\n"
        "This build keeps a single engine to simplify maintenance and avoid\n"
        "accidentally selecting older experimental variants."
    ),
    "Detail Level": (
        "Controls the number of waypoints (steps) the sand machine will follow.\n\n"
        "Fewer points = faster draw, less detail, smoother curves.\n"
        "More points = slower draw, finer detail, more faithful to the original.\n\n"
        "Recommended: 800–2000 for most images. Above 3000 rarely adds\n"
        "visible detail but increases draw time significantly."
    ),
    "Outside-in": (
        "When ON: the machine draws outermost contours first, then works\n"
        "inward. As it draws you can see the overall shape emerge early.\n\n"
        "When OFF: uses pure nearest-neighbour ordering (faster travel,\n"
        "but the image builds up in a less visually satisfying order)."
    ),
    "Complexity": (
        "Controls how hard the algorithm tries to retrace along drawn lines\n"
        "instead of cutting across untouched sand.\n\n"
        "1% = fast, coarse pathfinding. May cut across small gaps.\n"
        "100% = thorough, pixel-level pathfinding. Slow but very clean.\n\n"
        "At higher values the grid is finer and the search explores more\n"
        "nodes, producing better retrace routes at the cost of CPU time.\n\n"
        "Default: 50%. Most images look good at 30–70%."
    ),
    "Strict Mode": (
        "Strict mode forbids new untouched-sand crossings (no bridges).\n\n"
        "Only islands that physically touch already drawn lines can be\n"
        "reached and drawn. Disconnected islands are skipped.\n\n"
        "Use this when you want maximum visual cleanliness and are okay\n"
        "with potentially incomplete drawings."
    ),
    "Scale %": (
        "How much of the Oasis Mini drawing circle the artwork fills.\n\n"
        "The drawing is centred on the content's visual centre (minimum\n"
        "enclosing circle), so it fills the table symmetrically.\n\n"
        "98% = matches the official Oasis template's design boundary.\n"
        "100% = outermost content point exactly at the physical table rim.\n"
        "Going above 100% is NOT recommended — outer content collapses to\n"
        "the rim edge and draws as a ring rather than detail.\n\n"
        "Default 98%. Only go lower (e.g. 90%) if the ball rattles the rail."
    ),
    "Thin Edges": (
        "Collapse double-edges into single centre lines.\n\n"
        "Canny edge detection produces TWO parallel contours for every\n"
        "line in the image (one on each side of the edge). This creates\n"
        "redundant parallel lines in the sand drawing.\n\n"
        "When ON: morphological skeletonisation merges double edges\n"
        "into a single clean centre line. Dramatically reduces clutter\n"
        "for images with clear lines (logos, line art, Pokémon outlines).\n\n"
        "When OFF: raw Canny edges are used as-is (both sides of each edge).\n\n"
        "Only applies in Edges mode (not Threshold)."
    ),
    "Straighten": (
        "Snap near-straight contours to perfect straight lines.\n\n"
        "Measures how 'straight' each contour is (ratio of endpoint distance\n"
        "to total arc length). Contours above the threshold get replaced\n"
        "with a perfect 2-point line.\n\n"
        "100% = disabled (nothing is 100% straight).\n"
        "95% = only snap nearly-perfect lines.\n"
        "90% = moderate — good for cleaning up wobbly edges.\n"
        "80% = aggressive — even somewhat curved contours get straightened.\n\n"
        "This does NOT affect curved contours — only ones that are\n"
        "already basically straight but have pixel-level wobble."
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# Tooltip widget
# ─────────────────────────────────────────────────────────────────────────────

class Tooltip:
    """Show a popup tooltip when hovering over a widget."""

    def __init__(self, widget: tk.Widget, text: str):
        self._widget = widget
        self._text   = text
        self._tip    = None
        widget.bind("<Enter>", self._show)
        widget.bind("<Leave>", self._hide)
        widget.bind("<ButtonPress>", self._hide)

    def _show(self, _event=None):
        if self._tip:
            return
        x = self._widget.winfo_rootx() + 20
        y = self._widget.winfo_rooty() + self._widget.winfo_height() + 4
        self._tip = tw = tk.Toplevel(self._widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        lbl = tk.Label(tw, text=self._text, justify="left",
                       background="#fffbe6", relief="solid", borderwidth=1,
                       font=("", 8), padx=6, pady=4, wraplength=320)
        lbl.pack()

    def _hide(self, _event=None):
        if self._tip:
            self._tip.destroy()
            self._tip = None


# ─────────────────────────────────────────────────────────────────────────────
# Canvas drawing utilities
# ─────────────────────────────────────────────────────────────────────────────

def _canvas_coords(norm_x: float, norm_y: float, size: int):
    """Map normalised [-1,1] space to canvas pixel coordinates."""
    cx = cy = size / 2
    px = cx + norm_x * (size / 2 - 4)
    py = cy - norm_y * (size / 2 - 4)   # Y flip: up = positive
    return px, py


def draw_thr_on_canvas(canvas: tk.Canvas, polar: np.ndarray, size: int,
                       show_orientation: bool = False):
    """Render an Nx2 (theta, rho) path array onto a tkinter Canvas.

    The *polar* array passed in must already have the same mirror + rotation
    transforms applied as _save_thr uses (mirror → π−θ, then −π/2 offset),
    so the preview matches the physical table exactly.

    If *show_orientation* is True the circle is drawn with table-axis markers:
      • Home notch gap at 6 o'clock (south) — the Oasis physical home position (θ=0)
      • A small triangle pointer at 3 o'clock (east) showing where the
        image top lands after mirror + −π/2 rotation
    """
    canvas.delete("path", "circle", "orient", "placeholder")
    m = 4
    cx = cy = size / 2
    r  = size / 2 - m          # circle radius in canvas pixels

    if show_orientation:
        # Draw the outer circle as two arcs with a gap at 6 o'clock (home notch).
        # tkinter arc: start/extent in degrees, 0° = 3 o'clock, CCW positive
        gap_deg = 8
        canvas.create_arc(m, m, size - m, size - m,
                          start=-(270 - gap_deg), extent=-(360 - 2 * gap_deg),
                          style="arc", outline=CIRCLE_COL, width=1, tags=("circle", "orient"))
        # Home notch label at 6 o'clock (south)
        notch_x, notch_y = _canvas_coords(0, -1.0, size)
        canvas.create_text(notch_x, notch_y + 10, text="⌂", fill="#996633",
                           font=("", 9), tags=("orient",))
        # "Top of drawing" indicator at 3 o'clock (east).
        # After the −π/2 rotation offset the image top (θ_internal = π/2) maps
        # to θ_display = 0 (east), so the indicator lives on the right side.
        # The arrow points LEFT (inward toward centre).
        tip_x, tip_y = _canvas_coords( 0.82,  0.00, size)   # arrow tip  (inner)
        wb_x,  wb_y  = _canvas_coords( 0.96,  0.06, size)   # base top
        wt_x,  wt_y  = _canvas_coords( 0.96, -0.06, size)   # base bottom
        canvas.create_polygon(tip_x, tip_y, wb_x, wb_y, wt_x, wt_y,
                              fill="#cc6600", outline="", tags=("orient",))
        canvas.create_text(size - m - 2, cy, text="◀ top",
                           fill="#996633", font=("", 7), anchor="e", tags=("orient",))
    else:
        canvas.create_oval(m, m, size - m, size - m,
                           outline=CIRCLE_COL, width=1, tags="circle")

    if polar is None or len(polar) < 2:
        return

    # Convert to canvas coords
    coords = []
    for theta, rho in polar:
        x = rho * math.cos(theta)
        y = rho * math.sin(theta)
        px, py = _canvas_coords(x, y, size)
        coords.extend([px, py])

    if len(coords) >= 4:
        canvas.create_line(*coords, fill=PATH_COL, width=1,
                           smooth=False, tags="path")


def draw_contours_on_canvas(canvas: tk.Canvas, contours: list,
                             img_w: int, img_h: int, size: int,
                             colour: str = None, tags_prefix: str = ""):
    """Draw pixel-space contours onto a tkinter Canvas, scaled so the
    outermost contour point sits at 95% of the circle radius."""
    col = colour or CONTOUR_COL
    tag_c = f"{tags_prefix}contour" if tags_prefix else "contour"
    tag_circle = f"{tags_prefix}circle" if tags_prefix else "circle"
    tag_inner  = f"{tags_prefix}innercircle" if tags_prefix else "innercircle"
    if not tags_prefix:
        canvas.delete("contour", "circle", "innercircle")
    m = 4
    if not tags_prefix:
        canvas.create_oval(m, m, size - m, size - m,
                           outline=CIRCLE_COL, width=1, tags=tag_circle)
        margin = (size / 2 - 4) * 0.05
        im = m + margin
        canvas.create_oval(im, im, size - im, size - im,
                           outline="#cc8844", width=1, dash=(4, 4),
                           tags=tag_inner)
    if not contours:
        return
    # Centre on content centroid and scale from there (matches core pipeline)
    cx_px, cy_px = core.compute_contour_center(contours, img_w, img_h)
    half = core.compute_contour_scale(contours, img_w, img_h, fill=1.0,
                                      center=(cx_px, cy_px))

    for c in contours:
        if len(c) < 2:
            continue
        coords = []
        for pt in c:
            nx =  (pt[0] - cx_px) / half
            ny = -(pt[1] - cy_px) / half
            px, py = _canvas_coords(nx, ny, size)
            coords.extend([px, py])
        if len(coords) >= 4:
            canvas.create_line(*coords, fill=col, width=1,
                               tags=tag_c)


def draw_segment_set_on_canvas(canvas: tk.Canvas, segments: list,
                               img_w: int, img_h: int, size: int,
                               kinds: list | None = None):
    """Draw planned segments with per-kind styling for diagnostics."""
    canvas.delete("all")
    m = 4
    canvas.create_oval(m, m, size - m, size - m,
                       outline=CIRCLE_COL, width=1)
    if not segments:
        return

    all_draw = []
    if kinds is None:
        all_draw = [seg for seg in segments if seg is not None and len(seg) > 1]
    else:
        all_draw = [seg for seg, k in zip(segments, kinds)
                    if seg is not None and len(seg) > 1 and k == "draw"]
    if all_draw:
        cx_px, cy_px = core.compute_contour_center(all_draw, img_w, img_h)
        half = core.compute_contour_scale(all_draw, img_w, img_h, fill=1.0,
                                          center=(cx_px, cy_px))
    else:
        cx_px, cy_px = img_w / 2.0, img_h / 2.0
        half = max(img_w, img_h) / 2.0

    palette = {
        "draw": "#cc6600",
        "retrace": "#6b4c2e",
        "bridge": "#2266cc",
        "home": "#2f7f2f",
    }

    for i, seg in enumerate(segments):
        if seg is None or len(seg) < 2:
            continue
        kind = kinds[i] if kinds is not None and i < len(kinds) else "draw"
        col = palette.get(kind, "#cc6600")
        width = 1 if kind != "bridge" else 2
        coords = []
        for pt in seg:
            nx = (pt[0] - cx_px) / half
            ny = -(pt[1] - cy_px) / half
            px, py = _canvas_coords(nx, ny, size)
            coords.extend([px, py])
        if len(coords) >= 4:
            canvas.create_line(*coords, fill=col, width=width, smooth=False)


def draw_binary_on_canvas(canvas: tk.Canvas, binary: np.ndarray, size: int):
    """
    Display the binary (edge) image on a canvas.
    Uses PIL if available; otherwise just draws contours.
    """
    canvas.delete("bgimg")
    if not HAS_PIL:
        return
    h, w = binary.shape
    # Make it a 3-channel sand-coloured image with white lines
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    sand = (245, 230, 200)
    rgb[:, :] = sand
    rgb[binary > 0] = (80, 40, 10)

    img = Image.fromarray(rgb, "RGB")
    # Fit into canvas square
    img = ImageOps.fit(img, (size, size), Image.Resampling.LANCZOS)
    photo = ImageTk.PhotoImage(img)
    canvas._bgimg_ref = photo          # keep reference
    canvas.create_image(0, 0, anchor="nw", image=photo, tags="bgimg")
    canvas.tag_lower("bgimg")


def _open_image_rgb(image_path: str, bg_color: str = "#ffffff") -> "Image.Image":
    """Open any image as RGB, compositing transparent areas onto bg_color."""
    img = Image.open(image_path)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        img = img.convert("RGBA")
        bg  = Image.new("RGB", img.size, bg_color)
        bg.paste(img, mask=img.split()[3])
        return bg
    return img.convert("RGB")


def draw_original_on_canvas(canvas: tk.Canvas, image_path: str, size: int):
    """Display the original image scaled to fill the canvas (requires PIL)."""
    canvas.delete("all")
    if not HAS_PIL:
        canvas.create_text(size // 2, size // 2,
                           text="PIL not available", fill="#b0907a",
                           font=("", 11), justify="center")
        return
    try:
        img = _open_image_rgb(image_path, bg_color="#f5e6c8")
        w, h  = img.size
        scale = min(size / w, size / h)
        img   = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        canvas._orig_ref = photo          # keep reference
        canvas.create_image(size // 2, size // 2, anchor="center", image=photo)
    except Exception as e:
        canvas.create_text(size // 2, size // 2,
                           text=f"Cannot load image:\n{e}",
                           fill="#b0907a", font=("", 9),
                           justify="center", width=size - 20)  # canvas uses width, not wraplength


def save_thr_preview_png(polar: np.ndarray, output_path: str, size: int = PREVIEW_EXPORT_SIZE,
                         navigate: np.ndarray = None, outline: np.ndarray = None, n_outline: int = 0,
                         mirror_enabled: bool = False) -> bool:
    """Render a THR path to a PNG image for quick visual QA.

    Args:
        polar: Full path array (theta, rho)
        output_path: Where to save the PNG
        size: Image size in pixels
        navigate: Navigate path component (theta, rho) - drawn in red
        outline: Outline path component (theta, rho) - drawn in blue
        n_outline: Number of points in polar that belong to outline
        mirror_enabled: Whether mirror transformation should be applied
    """
    if not HAS_PIL or Image is None or ImageDraw is None:
        return False
    if polar is None or len(polar) < 2:
        return False

    m = 8
    img = Image.new("RGB", (size, size), SAND_BG)
    draw = ImageDraw.Draw(img)

    # Outer table boundary.
    draw.ellipse((m, m, size - m, size - m), outline=CIRCLE_COL, width=2)

    # Apply transformations to drawing path (outline + main drawing) and draw in black first (bottom-most layer)
    # The polar array contains outline + main drawing, and navigate is separate
    # We should draw the entire polar array since it doesn't include navigate
    drawing_polar = polar.copy()

    drawing_transformed = drawing_polar.copy()
    if mirror_enabled:
        drawing_transformed[:, 0] = math.pi - drawing_transformed[:, 0]
    drawing_transformed[:, 0] -= math.pi / 2

    pts = []
    for theta, rho in drawing_transformed:
        x = rho * math.cos(float(theta))
        y = rho * math.sin(float(theta))
        px, py = _canvas_coords(x, y, size)
        pts.append((px, py))

    if len(pts) >= 2:
        draw.line(pts, fill="black", width=2)  # Drawing path in black

    # Draw outline path in blue (middle layer)
    if outline is not None and len(outline) >= 2:
        outline_pts = []
        for theta, rho in outline:
            x = rho * math.cos(float(theta))
            y = rho * math.sin(float(theta))
            px, py = _canvas_coords(x, y, size)
            outline_pts.append((px, py))
        if len(outline_pts) >= 2:
            draw.line(outline_pts, fill="#2266cc", width=3)  # Blue for outline

    # Draw navigate path in red last (top layer)
    if navigate is not None and len(navigate) >= 2:
        nav_pts = []
        for theta, rho in navigate:
            x = rho * math.cos(float(theta))
            y = rho * math.sin(float(theta))
            px, py = _canvas_coords(x, y, size)
            nav_pts.append((px, py))
        if len(nav_pts) >= 2:
            draw.line(nav_pts, fill="#cc0000", width=3)  # Red for navigate

    # Mark start point so orientation is obvious when browsing previews.
    # Use navigate start if available, otherwise outline start, otherwise polar start
    if navigate is not None and len(navigate) >= 2:
        start_theta, start_rho = navigate[0]
    elif outline is not None and len(outline) >= 2:
        start_theta, start_rho = outline[0]
    else:
        start_theta, start_rho = polar[0]

    x = start_rho * math.cos(float(start_theta))
    y = start_rho * math.sin(float(start_theta))
    sx, sy = _canvas_coords(x, y, size)
    r = 5
    draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill="#cc2200", outline="white", width=1)
    ImageOps.exif_transpose(img).save(output_path, format="PNG")
    return True


def _render_thr_preview_pil(result, size: int = 200,
                              mirror_enabled: bool = False):
    """Render a build_thr_path result dict to a PIL Image (in-memory, no file I/O).

    Draws in the same raw coordinate space that the live canvas preview uses
    (draw_thr_on_canvas applies no rotation/mirror — neither do we).  The
    mirror_enabled argument is accepted for API compatibility but not applied
    here: the raw result already matches the original image orientation.
    """
    if not HAS_PIL:
        return None
    if isinstance(result, dict):
        _p = result.get("polar")
        polar    = np.asarray(_p) if _p is not None else np.array([])
        navigate = result.get("navigate")
        outline  = result.get("outline")
    else:
        polar    = np.asarray(result) if result is not None else np.array([])
        navigate = None
        outline  = None

    def _to_pts(arr):
        if arr is None or len(arr) < 2:
            return []
        a = np.asarray(arr, dtype=float)
        return [_canvas_coords(rho * math.cos(th), rho * math.sin(th), size)
                for th, rho in a]

    m   = 6
    img  = Image.new("RGB", (size, size), SAND_BG)
    draw = ImageDraw.Draw(img)
    draw.ellipse((m, m, size - m, size - m), outline=CIRCLE_COL, width=2)

    # Draw in the same order as the GUI canvas preview (no transform applied)
    pts = _to_pts(polar)
    if len(pts) >= 2:
        draw.line(pts, fill="black", width=1)

    ol_pts = _to_pts(outline)
    if len(ol_pts) >= 2:
        draw.line(ol_pts, fill="#2266cc", width=2)

    nav_pts = _to_pts(navigate)
    if len(nav_pts) >= 2:
        draw.line(nav_pts, fill="#cc0000", width=2)

    return img


# ─────────────────────────────────────────────────────────────────────────────
# Settings picker — variants, helpers, dialog
# ─────────────────────────────────────────────────────────────────────────────

# Tuple: (blur_override, canny_mult, smooth, thin, min_len_mult, canny_low_ratio, label)
#   blur_override    – int or None (None = use auto-detected blur)
#   canny_low_ratio  – float or None (None = derive as 0.33 × canny_high)
_PICKER_PHASE1_VARIANTS = [
    (1, 1.00, 1, False, 1.0, None, "Blur 1"),
    (2, 1.00, 1, False, 1.0, None, "Blur 2"),
    (3, 1.00, 1, False, 1.0, None, "Blur 3"),
    (4, 1.00, 1, False, 1.0, None, "Blur 4"),
    (5, 1.00, 1, False, 1.0, None, "Blur 5"),
]
# Phase 2 – canny HIGH multipliers (5 options, weighted toward higher end where picks cluster)
_PHASE2_CANNY     = [0.65, 1.00, 1.35, 1.60, 1.80]
# Phase 3 – canny LOW ratio as fraction of canny_high (5 options, weighted toward higher ratios)
_PHASE3_CANNY_LOW = [0.20, 0.33, 0.42, 0.50, 0.60]
# Phase 4 – min-length multipliers
_PHASE4_MINLEN    = [0.55, 1.80, 3.00, 4.00]
_PHASE_NAMES      = ["Blur", "Canny High", "Canny Low", "Min Lengths"]


def _make_variant_params(auto_settings: dict, base_kwargs: dict,
                          blur_override: int | None, canny_mult: float,
                          smooth: int, thin: bool,
                          min_len_mult: float = 1.0,
                          canny_low_ratio: float | None = None) -> dict:
    """Return a build_thr_path kwargs dict for one picker variant (no image_path/progress_cb).

    blur_override=None  → use auto-detected blur.
    canny_low_ratio=None → derive canny_low as 33 % of canny_high (default behaviour).
    """
    params = dict(base_kwargs)
    raw_high = auto_settings["canny_high"] * canny_mult
    ch = int(np.clip(raw_high, 20, 220))
    ratio = canny_low_ratio if canny_low_ratio is not None else 0.33
    cl = max(10, min(ch - 5, int(ch * ratio)))
    params.update({
        "blur":       int(auto_settings["blur"]) if blur_override is None else blur_override,
        "canny_low":  cl,
        "canny_high": ch,
        "min_area":   float(auto_settings["min_area"]),
        "min_length": round(float(auto_settings["min_length"]) * min_len_mult, 1),
        "smooth":     smooth,
        "thin":       thin,
    })
    params.pop("image_path",  None)
    params.pop("progress_cb", None)
    return params


def _params_key(params: dict) -> tuple:
    """Hashable key that identifies a fully-resolved params dict."""
    return (params["blur"], params["canny_low"], params["canny_high"],
            params["smooth"], round(params["min_length"], 1))


class SettingsPickerDialog(tk.Toplevel):
    """Pop-up with 9 full THR path previews (blur 1/2/3 × smooth 1/3/5).

    Maximised, scrollable, 3 per row.  Each cell shows a real determinate
    progress bar driven by build_thr_path's progress_cb.  A shared
    preload_cache lets batch callers pre-warm results before the dialog opens.
    """

    N_COLS = 3

    def __init__(self, parent, image_path: str, auto_settings: dict,
                 base_kwargs: dict, mirror_enabled: bool,
                 on_select, preload_cache: dict | None = None):
        super().__init__(parent)
        self.title(f"Pick Best Settings — {Path(image_path).name}")
        self.configure(bg=SAND_BG)
        self.resizable(True, True)
        self.state("zoomed")

        # Thumbnail size: target 7.5 physical inches, capped so 3 fit per row.
        # winfo_fpixels('1i') returns logical pixels per inch (DPI-aware).
        try:
            dpi = self.winfo_fpixels('1i')
        except Exception:
            dpi = 96.0
        screen_w   = self.winfo_screenwidth()
        target_px  = int(7.5 * dpi)
        # Leave ~160 px for scrollbar, cell padding, and window chrome
        max_px     = (screen_w - 160) // self.N_COLS
        self.THUMB_SIZE = min(target_px, max_px)

        self._on_select      = on_select
        self._image_path     = image_path
        self._mirror         = mirror_enabled
        self._auto_settings  = auto_settings
        self._base_kwargs    = base_kwargs
        self._phase          = 1
        self._executor       = ThreadPoolExecutor(max_workers=6)
        self._canvas: tk.Canvas | None = None
        self._grid_inner: tk.Frame | None = None
        self._gen_next_btn: ttk.Button | None = None
        self._step_labels:   list = []
        # Internal preload: when a Phase-N cell finishes, start its Phase-N+1 variants
        self._preload_exec:    ThreadPoolExecutor | None = None
        self._preload_results: dict = {}   # params_key → img | Exception
        self._preload_futures: dict = {}   # params_key → Future
        self._preload_ready    = 0         # next-phase items already computed
        self._preload_expected = 0         # next-phase items queued
        self._preload_label:  ttk.Label | None = None

        phase1 = self._dedup_variants(_PICKER_PHASE1_VARIANTS)
        n = len(phase1)
        self._cells: list[tuple]        = []
        self._variant_tuples: list      = []
        self._photo_refs: list          = [None] * n
        self._variant_params: list      = [None] * n
        self._active_slots: list[int]   = list(range(n))
        self._seen_image_hashes: set    = set()
        self._n_done  = 0
        self._n_total = n
        self._pil_refs: list               = [None] * n   # PIL images for reload cache
        self._phase_initial_variants: list = phase1       # full deduped list at phase start

        self._build_header(image_path)
        self._build_overall_bar()
        self._init_scroll_container()
        self._build_reference_cell(image_path)   # fixed (0,0) — not in _cells
        self._build_cells(phase1)
        self._start_computing(phase1, preload_cache)

        self.transient(parent)
        self.lift()
        self.focus_set()

    # ── header ────────────────────────────────────────────────────────────────

    def _build_header(self, image_path: str):
        hdr = ttk.Frame(self, padding=(10, 8))
        hdr.pack(fill="x")

        ttk.Label(hdr, text=Path(image_path).name,
                  font=("", 10)).pack(side="left")

        # Right side (packed right-to-left): Cancel · Reload Phase · Swap Top 2 · Generate Next
        ttk.Button(hdr, text="✖  Cancel",
                   command=self._on_cancel).pack(side="right", padx=(6, 0))
        ttk.Button(hdr, text="↺  Reload Phase",
                   command=self._reload_phase).pack(side="right", padx=(0, 6))
        ttk.Button(hdr, text="↔  Swap Top 2",
                   command=self._swap_first_two).pack(side="right", padx=(0, 6))
        self._gen_next_btn = ttk.Button(
            hdr, text=f"Next: {_PHASE_NAMES[1]} →", state="disabled",
            command=self._generate_next_phase)
        self._gen_next_btn.pack(side="right", padx=(0, 8))

        # Step breadcrumb — pack left-to-right after the filename
        step_frame = ttk.Frame(hdr)
        step_frame.pack(side="left", padx=(20, 0))
        self._step_labels = []
        for i, name in enumerate(_PHASE_NAMES):
            if i > 0:
                ttk.Label(step_frame, text="  →  ", foreground="#aaa").pack(side="left")
            lbl = ttk.Label(step_frame, text=f"{i+1}. {name}", font=("", 9))
            lbl.pack(side="left")
            self._step_labels.append(lbl)
        self._update_step_indicator()

    def _update_step_indicator(self):
        for i, lbl in enumerate(self._step_labels):
            phase = i + 1
            if phase == self._phase:
                lbl.config(font=("", 9, "bold"), foreground="#1a6a1a")
            elif phase < self._phase:
                lbl.config(font=("", 9),         foreground="#999999")
            else:
                lbl.config(font=("", 9),         foreground="#cccccc")

    def _build_overall_bar(self):
        bar_frame = ttk.Frame(self, padding=(10, 0, 10, 4))
        bar_frame.pack(fill="x")

        row1 = ttk.Frame(bar_frame)
        row1.pack(fill="x")
        self._progress_label = ttk.Label(
            row1, text=f"Computing previews… 0 / {self._n_total}",
            foreground="#555", font=("", 9))
        self._progress_label.pack(side="left")
        self._preload_label = ttk.Label(
            row1, text="", foreground="#2a6a2a", font=("", 9))
        self._preload_label.pack(side="right")

        self._progress_bar = ttk.Progressbar(
            bar_frame, orient="horizontal", mode="determinate",
            maximum=self._n_total, value=0)
        self._progress_bar.pack(fill="x", pady=(2, 4))

    def _update_preload_label(self):
        if not self.winfo_exists() or self._preload_label is None:
            return
        if self._preload_expected == 0:
            self._preload_label.config(text="")
        else:
            self._preload_label.config(
                text=f"Next page: {self._preload_ready} / {self._preload_expected} preloaded")

    # ── scrollable grid ───────────────────────────────────────────────────────

    def _init_scroll_container(self):
        """Create the canvas + scrollbar + inner frame once (persists across phases)."""
        container = ttk.Frame(self)
        container.pack(fill="both", expand=True)

        canvas  = tk.Canvas(container, bg=SAND_BG, highlightthickness=0)
        vscroll = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=vscroll.set)
        vscroll.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner  = ttk.Frame(canvas)
        self._grid_inner = inner
        self._canvas     = canvas
        win_id = canvas.create_window((0, 0), window=inner, anchor="nw")

        inner.bind("<Configure>",  lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(win_id, width=e.width))
        canvas.bind("<MouseWheel>", lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))
        inner.bind("<MouseWheel>",  lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))

    def _build_reference_cell(self, image_path: str):
        """Place the original source image at grid position (0, 0) as a fixed reference."""
        S = self.THUMB_SIZE
        cell = ttk.Frame(self._grid_inner, padding=8)
        cell.grid(row=0, column=0, padx=8, pady=8, sticky="n")
        self._ref_cell = cell

        ttk.Label(cell, text="Original Image", font=("", 10, "bold"),
                  foreground="#555555").pack(anchor="w")

        img_lbl = tk.Label(cell, bg=SAND_BG, width=S, height=S, relief="flat")
        img_lbl.pack()

        if HAS_PIL:
            try:
                ref  = _open_image_rgb(image_path, bg_color=SAND_BG)
                w, h = ref.size
                scale = min(S / w, S / h)
                ref  = ref.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
                bg   = Image.new("RGB", (S, S), SAND_BG)
                bg.paste(ref, ((S - ref.width) // 2, (S - ref.height) // 2))
                self._ref_photo = ImageTk.PhotoImage(bg)
                img_lbl.config(image=self._ref_photo, width=0, height=0)
            except Exception:
                img_lbl.config(text="(image unavailable)", fg="#999")

    def _build_cells(self, variants: list):
        """Populate self._grid_inner with one cell per variant."""
        S = self.THUMB_SIZE
        if HAS_PIL:
            _ph      = Image.new("RGB", (S, S), "#e0c8a0")
            _ph_draw = ImageDraw.Draw(_ph)
            _ph_draw.text((S // 2 - 46, S // 2 - 6), "Computing…", fill="#7a5c3c")
        else:
            _ph = None

        for i, (*_, label) in enumerate(variants):
            pos = i + 1   # slot 0 is occupied by the reference image
            row = pos // self.N_COLS
            col = pos  % self.N_COLS

            cell = ttk.Frame(self._grid_inner, padding=8)
            cell.grid(row=row, column=col, padx=8, pady=8, sticky="n")

            ttk.Label(cell, text=label, font=("", 10, "bold"),
                      foreground="#3a2a1a").pack(anchor="w")

            if _ph is not None:
                ph_photo = ImageTk.PhotoImage(_ph)
                self._photo_refs[i] = ph_photo
                img_lbl = tk.Label(cell, image=ph_photo, relief="flat")
            else:
                img_lbl = tk.Label(cell, bg="#e0c8a0", width=46, height=22,
                                    relief="flat", text="Computing…",
                                    fg="#7a5c3c", font=("", 9))
            img_lbl.pack()

            cell_bar = ttk.Progressbar(cell, orient="horizontal",
                                        mode="determinate", maximum=100, value=0,
                                        length=S)
            cell_bar.pack(fill="x", pady=(4, 0))

            status_lbl = ttk.Label(cell, text="", foreground="#555", font=("", 8))
            status_lbl.pack(anchor="w")

            btn_row = ttk.Frame(cell)
            btn_row.pack(pady=(6, 28), anchor="w")   # 28 px below buttons so last row clears the scrollbar
            sel_btn = ttk.Button(btn_row, text="✓  Select", state="disabled",
                                  command=lambda idx=i: self._on_select_slot(idx))
            sel_btn.pack(side="left", padx=(0, 6))
            rem_btn = ttk.Button(btn_row, text="✕  Remove",
                                  command=lambda idx=i: self._remove_cell(idx))
            rem_btn.pack(side="left")

            self._cells.append((cell, img_lbl, cell_bar, status_lbl, sel_btn, rem_btn))
            self._variant_tuples.append(variants[i])

        # Deferred scroll-region update — layout must settle before bbox is accurate
        if self._canvas:
            self.after(150, lambda: self._canvas.configure(
                scrollregion=self._canvas.bbox("all")))

    # ── compute ───────────────────────────────────────────────────────────────

    def _start_computing(self, variants: list, preload_cache: dict | None):
        auto_settings = self._auto_settings
        base_kwargs   = self._base_kwargs
        for i, (blur, mult, smooth, thin, mln, clr, _) in enumerate(variants):
            params = _make_variant_params(auto_settings, base_kwargs, blur, mult, smooth, thin, mln, clr)
            self._variant_params[i] = params

            # Outer cache: batch preloader keyed by (image_path, slot_index)
            cache_key = (self._image_path, i)
            if preload_cache is not None and cache_key in preload_cache:
                cached = preload_cache[cache_key]
                if isinstance(cached, Exception):
                    self.after(1, lambda s=i, e=cached: self._set_cell_err(s, str(e)))
                else:
                    self.after(1, lambda s=i, im=cached: self._set_cell_ok(s, im))
                continue

            # Inner preload cache: next-phase preloading keyed by resolved params
            pk = _params_key(params)
            if pk in self._preload_results:
                cached = self._preload_results.pop(pk)
                self._preload_futures.pop(pk, None)
                if isinstance(cached, Exception):
                    self.after(1, lambda s=i, e=cached: self._set_cell_err(s, str(e)))
                else:
                    self.after(1, lambda s=i, im=cached: self._set_cell_ok(s, im))
                continue

            self._executor.submit(self._bg_compute, i, params, preload_cache)

    def _bg_compute(self, slot: int, params: dict, preload_cache: dict | None):
        last_pct = [-1]

        def progress_cb(done: int, total: int):
            pct = int(100 * done / max(total, 1))
            if pct != last_pct[0] and self.winfo_exists():
                last_pct[0] = pct
                self.after(0, lambda p=pct: self._set_cell_progress(slot, p))

        try:
            result = core.build_thr_path(image_path=self._image_path,
                                          progress_cb=progress_cb, **params)
            img    = _render_thr_preview_pil(result, size=self.THUMB_SIZE,
                                              mirror_enabled=self._mirror)
            if preload_cache is not None:
                preload_cache[(self._image_path, slot)] = img
            if self.winfo_exists():
                self.after(0, lambda s=slot, im=img: self._set_cell_ok(s, im))
        except Exception as exc:
            if preload_cache is not None:
                preload_cache[(self._image_path, slot)] = exc
            if self.winfo_exists():
                self.after(0, lambda s=slot, e=exc: self._set_cell_err(s, str(e)))

    # ── cell updates (main thread) ────────────────────────────────────────────

    def _set_cell_progress(self, slot: int, pct: int):
        if not self.winfo_exists() or slot not in self._active_slots:
            return
        _, _, cell_bar, status_lbl, _, _ = self._cells[slot]
        cell_bar["value"] = pct
        status_lbl.config(text=f"{pct}%", foreground="#555")

    def _advance_overall(self):
        self._n_done += 1
        if not self.winfo_exists():
            return
        self._progress_bar["maximum"] = self._n_total
        self._progress_bar["value"]   = self._n_done
        if self._n_done >= self._n_total:
            phase_msgs = {
                1: "Phase 1 done — remove what you don't want, then click Generate Next Phase.",
                2: "Phase 2 done — remove what you don't want, then click Generate Next Phase.",
                3: "Phase 3 done — remove what you don't want, then click Generate Next Phase.",
                4: "All previews ready — select the best one.",
            }
            self._progress_label.config(text=phase_msgs.get(self._phase, "Done."))
            if self._phase < 4 and self._gen_next_btn and len(self._active_slots) > 0:
                next_name = _PHASE_NAMES[self._phase]  # _phase is 1-indexed; index gives next
                self._gen_next_btn.config(state="normal",
                                          text=f"Next: {next_name} →")
        else:
            self._progress_label.config(
                text=f"Computing previews… {self._n_done} / {self._n_total}")

    def _set_cell_ok(self, slot: int, img):
        if not self.winfo_exists() or slot not in self._active_slots:
            return
        h = self._image_hash(img)
        if h in self._seen_image_hashes:
            self._advance_overall()
            self.after(80, lambda s=slot: self._auto_remove_duplicate(s))
            return
        self._seen_image_hashes.add(h)
        _, img_lbl, cell_bar, status_lbl, sel_btn, _ = self._cells[slot]
        self._pil_refs[slot] = img
        photo = ImageTk.PhotoImage(img)
        self._photo_refs[slot] = photo
        img_lbl.config(image=photo, text="", width=0, height=0)
        cell_bar["value"] = 100
        cell_bar.pack_forget()
        status_lbl.config(text="Ready", foreground="#2a6a2a")
        sel_btn.config(state="normal")
        self._advance_overall()
        # Preload next-phase variants for this slot in the background
        if self._phase < 4:
            self._queue_preload(self._phase, slot)

    def _set_cell_err(self, slot: int, msg: str):
        if not self.winfo_exists() or slot not in self._active_slots:
            return
        _, img_lbl, cell_bar, status_lbl, _, _ = self._cells[slot]
        cell_bar.pack_forget()
        img_lbl.config(text="✖", bg="#f0d0d0", fg="red", font=("", 18, "bold"))
        status_lbl.config(text=f"Failed: {msg[:60]}", foreground="red")
        self._advance_overall()

    # ── multi-phase progression ───────────────────────────────────────────────

    def _dedup_variants(self, variants: list) -> list:
        """Drop variants whose resolved params are identical to an earlier one."""
        seen: set = set()
        out:  list = []
        for vt in variants:
            blur, mult, smooth, thin, mln, clr, _ = vt
            p   = _make_variant_params(self._auto_settings, self._base_kwargs,
                                        blur, mult, smooth, thin, mln, clr)
            k = _params_key(p)
            if k not in seen:
                seen.add(k)
                out.append(vt)
        return out

    def _image_hash(self, img) -> str:
        """Perceptual hash of a PIL image — identical-looking renders collide."""
        thumb = img.copy()
        thumb.thumbnail((48, 48))
        arr = np.array(thumb.convert("L")) // 16  # quantise to 16 levels
        return hashlib.md5(arr.tobytes()).hexdigest()

    def _auto_remove_duplicate(self, slot: int):
        """Silently remove a duplicate cell without touching n_done/n_total."""
        if not self.winfo_exists() or slot not in self._active_slots:
            return
        if self._phase < 4:
            self._cancel_preload_for_slot(self._phase, slot)
        self._active_slots.remove(slot)
        self._cells[slot][0].destroy()
        self._regrid_cells()
        if self._n_done >= self._n_total and self._phase < 4 \
                and self._gen_next_btn and len(self._active_slots) > 0:
            next_name = _PHASE_NAMES[self._phase]
            self._gen_next_btn.config(state="normal", text=f"Next: {next_name} →")

    def _next_phase_variants_for_slot(self, from_phase: int, slot: int) -> list:
        """Return the variant tuples that would be generated for `slot` in the next phase."""
        blur, mult, smooth, thin, mln, clr, base = self._variant_tuples[slot]
        if from_phase == 1:
            auto_ch = self._auto_settings.get("canny_high", 100)
            out = []
            for m in _PHASE2_CANNY:
                ch = int(np.clip(auto_ch * m, 20, 220))
                out.append((blur, m, smooth, thin, 1.0, None, f"{base} · Canny High {ch}"))
            return out
        if from_phase == 2:
            params   = self._variant_params[slot] if slot < len(self._variant_params) else None
            act_ch   = params["canny_high"] if params else int(
                np.clip(self._auto_settings.get("canny_high", 100) * mult, 20, 220))
            out = []
            for r in _PHASE3_CANNY_LOW:
                cl = max(10, min(act_ch - 5, int(act_ch * r)))
                out.append((blur, mult, smooth, thin, 1.0, r, f"{base} · Canny Low {cl}"))
            return out
        if from_phase == 3:
            auto_ml = float(self._auto_settings.get("min_length", 8.0))
            return [(blur, mult, smooth, thin, m, clr,
                     f"{base} · Lines {round(auto_ml * m, 1)}")
                    for m in _PHASE4_MINLEN]
        return []

    def _queue_preload(self, from_phase: int, slot: int):
        """Submit next-phase variants for `slot` to the background preload executor."""
        if self._preload_exec is None:
            self._preload_exec = ThreadPoolExecutor(max_workers=4)
        for vt in self._next_phase_variants_for_slot(from_phase, slot):
            blur, mult, smooth, thin, mln, clr, _ = vt
            params = _make_variant_params(self._auto_settings, self._base_kwargs,
                                           blur, mult, smooth, thin, mln, clr)
            pk = _params_key(params)
            if pk in self._preload_results or pk in self._preload_futures:
                continue
            self._preload_expected += 1
            future = self._preload_exec.submit(self._preload_one_variant, pk, params)
            self._preload_futures[pk] = future
        self.after(0, self._update_preload_label)

    def _preload_one_variant(self, pk: tuple, params: dict):
        try:
            result = core.build_thr_path(image_path=self._image_path, **params)
            img    = _render_thr_preview_pil(result, size=self.THUMB_SIZE,
                                              mirror_enabled=self._mirror)
            self._preload_results[pk] = img
        except Exception as exc:
            self._preload_results[pk] = exc
        self._preload_futures.pop(pk, None)
        self._preload_ready += 1
        if self.winfo_exists():
            self.after(0, self._update_preload_label)

    def _cancel_preload_for_slot(self, from_phase: int, slot: int):
        """Cancel pending preload jobs that came from this slot."""
        for vt in self._next_phase_variants_for_slot(from_phase, slot):
            blur, mult, smooth, thin, mln, clr, _ = vt
            params = _make_variant_params(self._auto_settings, self._base_kwargs,
                                           blur, mult, smooth, thin, mln, clr)
            pk = _params_key(params)
            future = self._preload_futures.pop(pk, None)
            if future:
                future.cancel()
                self._preload_expected = max(0, self._preload_expected - 1)
            self._preload_results.pop(pk, None)
        self.after(0, self._update_preload_label)

    def _generate_next_phase(self):
        """Advance from the current phase to the next using surviving cells."""
        if not self.winfo_exists():
            return
        self._gen_next_btn.config(state="disabled")

        if self._phase in (1, 2, 3):
            next_variants = []
            for slot in self._active_slots:
                next_variants.extend(
                    self._next_phase_variants_for_slot(self._phase, slot))
            self._transition_phase(next_variants, self._phase + 1)

    def _transition_phase(self, raw_variants: list, next_phase: int):
        """Dedup, tear down old cells, and start computing the next phase."""
        variants = self._dedup_variants(raw_variants)
        if not variants:
            return

        self._phase = next_phase
        self._update_step_indicator()

        # Reset button label for after this phase completes (if a further phase exists)
        if next_phase < 4:
            next_name = _PHASE_NAMES[next_phase]  # next_phase is 1-indexed
            self._gen_next_btn.config(text=f"Next: {next_name} →")

        for slot in range(len(self._cells)):
            try:
                self._cells[slot][0].destroy()
            except Exception:
                pass

        n = len(variants)
        self._cells                    = []
        self._variant_tuples           = []
        self._photo_refs               = [None] * n
        self._pil_refs                 = [None] * n
        self._variant_params           = [None] * n
        self._active_slots             = list(range(n))
        self._seen_image_hashes        = set()
        self._phase_initial_variants   = variants
        self._n_done  = 0
        self._n_total = n
        self._preload_ready    = 0
        self._preload_expected = 0

        self._progress_bar["maximum"] = n
        self._progress_bar["value"]   = 0
        phase_name = _PHASE_NAMES[next_phase - 1]
        self._progress_label.config(text=f"Computing {phase_name} previews… 0 / {n}")
        self._update_preload_label()

        if self._canvas:
            self._canvas.yview_moveto(0)

        self._build_cells(variants)

        self._executor.shutdown(wait=False)
        self._executor = ThreadPoolExecutor(max_workers=6)
        self._start_computing(variants, preload_cache=None)

    # ── remove / regrid ───────────────────────────────────────────────────────

    def _remove_cell(self, slot: int):
        if not self.winfo_exists() or slot not in self._active_slots:
            return
        # If this cell was still computing, shrink the expected total so the
        # overall bar can still reach 100 %.
        _, _, _, _, sel_btn, _ = self._cells[slot]
        if str(sel_btn["state"]) == "disabled":
            self._n_total = max(self._n_done, self._n_total - 1)
            self._advance_overall()
            self._n_done -= 1   # _advance_overall incremented it; undo that

        if self._phase < 4:
            self._cancel_preload_for_slot(self._phase, slot)
        self._active_slots.remove(slot)
        self._cells[slot][0].destroy()   # destroy the cell frame
        self._regrid_cells()

    def _regrid_cells(self):
        """Re-position all remaining cells sequentially, leaving (0,0) for the reference."""
        for new_pos, slot in enumerate(self._active_slots):
            pos = new_pos + 1   # reference image holds position 0
            row = pos // self.N_COLS
            col = pos  % self.N_COLS
            self._cells[slot][0].grid(row=row, column=col,
                                       padx=8, pady=8, sticky="n")

    def _swap_first_two(self):
        """Swap the grid positions of the first two active variant cells."""
        if len(self._active_slots) < 2:
            return
        self._active_slots[0], self._active_slots[1] = (
            self._active_slots[1], self._active_slots[0])
        self._regrid_cells()

    def _restore_cell_image(self, slot: int, pil_img):
        """Show a cached PIL image in a cell, bypassing the image-hash dedup check."""
        if not self.winfo_exists() or slot not in self._active_slots:
            return
        self._pil_refs[slot] = pil_img
        self._seen_image_hashes.add(self._image_hash(pil_img))
        _, img_lbl, cell_bar, status_lbl, sel_btn, _ = self._cells[slot]
        photo = ImageTk.PhotoImage(pil_img)
        self._photo_refs[slot] = photo
        img_lbl.config(image=photo, text="", width=0, height=0)
        cell_bar["value"] = 100
        cell_bar.pack_forget()
        status_lbl.config(text="Ready", foreground="#2a6a2a")
        sel_btn.config(state="normal")
        self._advance_overall()
        if self._phase < 4:
            self._queue_preload(self._phase, slot)

    def _reload_phase(self):
        """Restore all original phase variants (including removed ones), serving cached images."""
        if not self.winfo_exists():
            return

        saved_pil    = self._pil_refs[:]          # indexed by original slot
        variants     = self._phase_initial_variants
        n            = len(variants)

        # Destroy existing cells
        for slot in range(len(self._cells)):
            try:
                self._cells[slot][0].destroy()
            except Exception:
                pass

        # Reset state
        self._cells             = []
        self._variant_tuples    = []
        self._photo_refs        = [None] * n
        self._pil_refs          = [None] * n
        self._variant_params    = [None] * n
        self._active_slots      = list(range(n))
        self._seen_image_hashes = set()
        self._n_done  = 0
        self._n_total = n

        self._progress_bar["maximum"] = n
        self._progress_bar["value"]   = 0
        phase_name = _PHASE_NAMES[self._phase - 1]
        self._progress_label.config(text=f"Computing {phase_name} previews… 0 / {n}")
        if self._gen_next_btn:
            self._gen_next_btn.config(state="disabled",
                                      text=f"Next: {_PHASE_NAMES[self._phase]} →"
                                           if self._phase < 4 else "Done")

        if self._canvas:
            self._canvas.yview_moveto(0)

        self._build_cells(variants)

        self._executor.shutdown(wait=False)
        self._executor = ThreadPoolExecutor(max_workers=6)

        # Serve from cache where available; recompute the rest
        for i, (blur, mult, smooth, thin, mln, clr, _) in enumerate(variants):
            params = _make_variant_params(self._auto_settings, self._base_kwargs,
                                          blur, mult, smooth, thin, mln, clr)
            self._variant_params[i] = params
            if i < len(saved_pil) and saved_pil[i] is not None:
                pil_img = saved_pil[i]
                self.after(1, lambda s=i, im=pil_img: self._restore_cell_image(s, im))
            else:
                self._executor.submit(self._bg_compute, i, params, None)

    # ── selection / cancel ────────────────────────────────────────────────────

    def _on_select_slot(self, slot: int):
        params = self._variant_params[slot]
        label  = self._variant_tuples[slot][-1] if slot < len(self._variant_tuples) else ""
        _save_settings_history(self._image_path, params, label)
        self._executor.shutdown(wait=False)
        self._on_select(params)
        if self.winfo_exists():
            self.destroy()

    def _on_cancel(self):
        self._executor.shutdown(wait=False)
        if self.winfo_exists():
            self.destroy()

    def destroy(self):
        for exc in [self._executor, self._preload_exec]:
            if exc is not None:
                try:
                    exc.shutdown(wait=False)
                except Exception:
                    pass
        super().destroy()


# ─────────────────────────────────────────────────────────────────────────────
# Main App
# ─────────────────────────────────────────────────────────────────────────────


def _entry_to_ball_start(entry_str: str) -> str:
    """Convert the GUI entry-position dropdown string to build_thr_path ball_start param."""
    s = entry_str.lower()
    if "none" in s:
        return "none"
    if "center" in s:
        return "center"
    return "edge"


class SandArtApp(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("Sand Art Converter")
        self.resizable(True, True)
        self.configure(bg=SAND_BG)
        # Start maximised (Windows)
        self.state("zoomed")

        # State
        self._cached_polar: np.ndarray | None = None
        self._cached_outline: np.ndarray | None = None   # outline loop, separate from full path
        self._cached_n_outline: int = 0                  # how many leading polar points are outline
        self._cached_navigate: np.ndarray | None = None  # navigate (Phase 1) polar path
        self._preview_job  = None
        self._working      = False
        # Fixed UI-hidden options requested by user.
        self._mode_var = tk.StringVar(value="edges")
        self._points_var = tk.IntVar(value=100000)
        self._outside_in_var = tk.BooleanVar(value=True)
        self._mirror_var = tk.BooleanVar(value=True)
        self._entry_var = tk.StringVar(value="Ball at center  (ρ=0)")
        self._strict_var   = tk.BooleanVar(value=False)
        self._settings_source: str = ""   # "history", "auto", or "" — set by preview worker
        self._use_history: bool = True    # toggle: use saved history vs force auto-detect
        self._active_task_id = 0
        self._active_task_kind = None
        self._cancel_requested = False
        self._trace_path: np.ndarray | None = None
        self._trace_index = 0
        self._trace_running = False
        self._trace_after_id = None
        self._trace_internal_update = False
        self._trace_speed_var = tk.IntVar(value=250)
        self._display_polar: np.ndarray | None = None
        self._display_navigate: np.ndarray | None = None
        self._last_preview_raw_points = 0
        self._last_preview_final_points = 0
        self._last_preview_trimmed_points = 0
        self._batch_total = 0
        self._batch_index = 0
        self._batch_name = ""
        self._picker_cache: dict = {}
        self._picker_preload_executor: ThreadPoolExecutor | None = None
        self._build_ui()

    # ── UI construction ──────────────────────────────────────────────────────

    def _build_ui(self):
        # 3 columns: controls | 2x2 preview grid | large path preview
        self.columnconfigure(0, minsize=CTRL_W)
        self.columnconfigure(1, weight=2, minsize=CANVAS_SIZE)
        self.columnconfigure(2, weight=2, minsize=CANVAS_SIZE)
        self.rowconfigure(0, weight=1)

        self._build_controls()
        self._build_preview_grid()
        self._build_path_canvas()
        # Show history status for the default/pre-filled image path
        self.after(100, lambda: self._update_history_note(self._image_var.get().strip()))

    def _build_preview_grid(self):
        """Column 1: preview grid — Original | Raw Contours | Smoothed Contours."""
        wrapper = ttk.Frame(self)
        wrapper.grid(row=0, column=1, sticky="nsew", padx=2, pady=6)
        wrapper.columnconfigure(0, weight=1)
        wrapper.columnconfigure(1, weight=1)
        wrapper.rowconfigure(0, weight=1)
        wrapper.rowconfigure(1, weight=1)

        # ── Top-left: Original image ─────────────────────────────────────
        orig_frame = ttk.LabelFrame(wrapper, text="Original Image", padding=4)
        orig_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 2), pady=(0, 2))
        orig_frame.rowconfigure(0, weight=1)
        orig_frame.columnconfigure(0, weight=1)

        self._orig_canvas = tk.Canvas(orig_frame, bg=SAND_BG, highlightthickness=0)
        self._orig_canvas.grid(row=0, column=0, sticky="nsew")
        self._orig_canvas.bind("<Configure>", self._on_orig_resize)
        self._draw_placeholder(self._orig_canvas, "Original image will\nappear here")

        # ── Top-right: Raw (pre-smooth) contours ─────────────────────────
        raw_frame = ttk.LabelFrame(wrapper, text="Raw Contours (pre-smooth)", padding=4)
        raw_frame.grid(row=0, column=1, sticky="nsew", padx=(2, 0), pady=(0, 2))
        raw_frame.rowconfigure(0, weight=1)
        raw_frame.columnconfigure(0, weight=1)

        self._raw_canvas = tk.Canvas(raw_frame, bg=SAND_BG, highlightthickness=0)
        self._raw_canvas.grid(row=0, column=0, sticky="nsew")
        self._raw_canvas.bind("<Configure>", self._on_raw_resize)
        self._draw_placeholder(self._raw_canvas, "Raw contours will\nappear here")

        # ── Bottom-left: Smoothed contours ────────────────────────────────
        smooth_frame = ttk.LabelFrame(wrapper, text="Smoothed Contours (post-smooth)", padding=4)
        smooth_frame.grid(row=1, column=0, sticky="nsew", padx=(0, 2), pady=(2, 0))
        smooth_frame.rowconfigure(0, weight=1)
        smooth_frame.columnconfigure(0, weight=1)

        self._edge_canvas = tk.Canvas(smooth_frame, bg=SAND_BG, highlightthickness=0)
        self._edge_canvas.grid(row=0, column=0, sticky="nsew")
        self._edge_canvas.bind("<Configure>", self._on_edge_resize)
        self._draw_placeholder(self._edge_canvas, "Smoothed contours will\nappear here")

        # ── Bottom-right: THR trace playback ──────────────────────────────
        trace_frame = ttk.LabelFrame(wrapper, text="THR Trace Playback", padding=4)
        trace_frame.grid(row=1, column=1, sticky="nsew", padx=(2, 0), pady=(2, 0))
        trace_frame.rowconfigure(0, weight=1)
        trace_frame.columnconfigure(0, weight=1)

        self._trace_canvas = tk.Canvas(trace_frame, bg=SAND_BG, highlightthickness=0)
        self._trace_canvas.grid(row=0, column=0, sticky="nsew")
        self._trace_canvas.bind("<Configure>", self._on_trace_resize)
        self._draw_placeholder(self._trace_canvas, "Convert first, then\nPlay to trace .thr path")

        trace_controls = ttk.Frame(trace_frame)
        trace_controls.grid(row=1, column=0, sticky="ew", pady=(4, 0))
        trace_controls.columnconfigure(0, weight=1)
        trace_controls.columnconfigure(1, weight=1)
        trace_controls.columnconfigure(2, weight=1)

        self._trace_play_btn = ttk.Button(trace_controls, text="Play",
                                          command=self._start_trace_playback, state="disabled")
        self._trace_play_btn.grid(row=0, column=0, sticky="ew")
        self._trace_pause_btn = ttk.Button(trace_controls, text="Pause",
                                           command=self._pause_trace_playback, state="disabled")
        self._trace_pause_btn.grid(row=0, column=1, sticky="ew", padx=4)
        self._trace_reset_btn = ttk.Button(trace_controls, text="Reset",
                                           command=self._reset_trace_playback, state="disabled")
        self._trace_reset_btn.grid(row=0, column=2, sticky="ew")

        speed_row = ttk.Frame(trace_frame)
        speed_row.grid(row=2, column=0, sticky="ew", pady=(4, 0))
        speed_row.columnconfigure(1, weight=1)
        ttk.Label(speed_row, text="Speed").grid(row=0, column=0, sticky="w", padx=(0, 4))
        self._trace_speed = ttk.Scale(speed_row, from_=20, to=1200,
                                      orient="horizontal", variable=self._trace_speed_var,
                                      state="disabled")
        self._trace_speed.grid(row=0, column=1, sticky="ew")

        self._trace_slider_var = tk.IntVar(value=0)
        self._trace_slider = ttk.Scale(trace_frame, from_=0, to=1000,
                                       orient="horizontal", variable=self._trace_slider_var,
                                       command=self._on_trace_seek, state="disabled")
        self._trace_slider.grid(row=3, column=0, sticky="ew", pady=(4, 0))

        self._trace_status_var = tk.StringVar(value="0 / 0")
        ttk.Label(trace_frame, textvariable=self._trace_status_var,
                  foreground="#666").grid(row=4, column=0, sticky="w", pady=(2, 0))

    def _build_controls(self):
        frame = ttk.Frame(self, width=CTRL_W, padding=10)
        frame.grid(row=0, column=0, sticky="nsew", padx=(6, 2), pady=6)
        frame.columnconfigure(0, weight=1)
        r = 0

        # ── Image file ────────────────────────────────────────────────────
        ttk.Label(frame, text="Image File", font=("", 9, "bold")).grid(
            row=r, column=0, sticky="w"); r += 1

        file_row = ttk.Frame(frame)
        file_row.grid(row=r, column=0, sticky="ew"); r += 1
        file_row.columnconfigure(0, weight=1)

        self._image_var = tk.StringVar(value="")
        ttk.Entry(file_row, textvariable=self._image_var,
                  width=22).grid(row=0, column=0, sticky="ew")
        ttk.Button(file_row, text="Browse…",
                   command=self._browse_image).grid(row=0, column=1, padx=(4, 0))
        ttk.Button(file_row, text="Next →",
                   command=self._next_image).grid(row=0, column=2, padx=(4, 0))

        ttk.Separator(frame, orient="horizontal").grid(
            row=r, column=0, sticky="ew", pady=8); r += 1
        adv = ttk.LabelFrame(frame, text="Advanced Settings", padding=6)
        adv.grid(row=r, column=0, sticky="ew"); r += 1
        adv.columnconfigure(1, weight=1)
        ar = 0

        def adv_row(label, var, from_, to, row, tip_key=None):
            lbl_w = ttk.Label(adv, text=label, width=13, anchor="w")
            lbl_w.grid(row=row, column=0, sticky="w")
            sl = ttk.Scale(adv, from_=from_, to=to, orient="horizontal",
                      variable=var,
                      command=self._on_setting_change)
            sl.grid(row=row, column=1, sticky="ew")
            val_lbl = ttk.Label(adv, width=4, anchor="e")
            val_lbl.grid(row=row, column=2, padx=(2, 0))
            var.trace_add("write", lambda *a, lbl=val_lbl, v=var:
                          lbl.config(text=str(int(v.get()))))
            val_lbl.config(text=str(int(var.get())))
            if tip_key and tip_key in TIPS:
                Tooltip(lbl_w, TIPS[tip_key])
                Tooltip(sl,    TIPS[tip_key])

        self._blur_var      = tk.IntVar(value=1)
        self._canny_low_var = tk.IntVar(value=30)
        self._canny_hi_var  = tk.IntVar(value=100)
        self._min_area_var  = tk.DoubleVar(value=10.0)

        adv_row("Blur",        self._blur_var,      1,   15, ar, "Blur");         ar += 1
        adv_row("Canny Low",   self._canny_low_var, 0,  255, ar, "Canny Low");    ar += 1
        adv_row("Canny High",  self._canny_hi_var,  0,  255, ar, "Canny High");   ar += 1
        adv_row("Min Area",    self._min_area_var,  0,  100, ar, "Min Area");     ar += 1

        self._min_length_var = tk.DoubleVar(value=20.0)
        adv_row("Min Length",  self._min_length_var, 0,  200, ar, "Min Length");  ar += 1

        self._smooth_var = tk.IntVar(value=1)
        adv_row("Smoothing",   self._smooth_var,    0,   25, ar, "Smoothing");    ar += 1

        self._fill_var = tk.IntVar(value=100)
        adv_row("Scale %",     self._fill_var,      50, 120, ar, "Scale %");      ar += 1

        # ── Hidden vars — fixed defaults ──────────────────────────────────────
        self._thresh_var     = tk.IntVar(value=128)
        self._invert_var     = tk.BooleanVar(value=True)
        self._straighten_var = tk.IntVar(value=90)
        self._complexity_var = tk.IntVar(value=100)

        # ── Thin edges fixed off (hidden from UI) ─────────────────────────
        self._thin_var = tk.BooleanVar(value=False)

        # ── History note + toggle ─────────────────────────────────────────
        self._history_note_var = tk.StringVar(value="")
        self._history_note_lbl = ttk.Label(
            adv, textvariable=self._history_note_var,
            foreground="#2a6a2a", font=("", 8), wraplength=160, justify="left",
        )
        self._history_note_lbl.grid(row=ar, column=0, columnspan=2, sticky="w")
        self._use_history_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(adv, text="Use History", variable=self._use_history_var,
                        command=self._on_history_toggle).grid(row=ar, column=2, sticky="e"); ar += 1


        ttk.Separator(frame, orient="horizontal").grid(
            row=r, column=0, sticky="ew", pady=8); r += 1

        # ── Action buttons ────────────────────────────────────────────────
        self._preview_btn = ttk.Button(
            frame, text="👁  Preview Edges",
            command=self._run_edge_preview)
        self._preview_btn.grid(row=r, column=0, sticky="ew"); r += 1

        self._convert_btn = ttk.Button(
            frame, text="⚙  Convert & Preview Path",
            command=self._run_conversion)
        self._convert_btn.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1

        self._picker_btn = ttk.Button(
            frame, text="🎛  Pick Best Settings",
            command=self._run_picker)
        self._picker_btn.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1

        self._batch_btn = ttk.Button(
            frame, text="📦  Batch Convert Folder",
            command=self._run_batch_conversion)
        self._batch_btn.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1

        self._batch_picker_btn = ttk.Button(
            frame, text="🎛  Batch Pick & Convert",
            command=self._run_batch_picker)
        self._batch_picker_btn.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1

        self._cancel_btn = ttk.Button(
            frame, text="✖  Cancel Current Task",
            command=self._cancel_active_task, state="disabled")
        self._cancel_btn.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1

        self._save_btn = ttk.Button(
            frame, text="💾  Save .thr File…",
            command=self._save_thr, state="disabled")
        self._save_btn.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1

        self._save_svg_btn = ttk.Button(
            frame, text="💾  Save .svg File…",
            command=self._save_svg, state="disabled")
        # Keep SVG export available in code, but hide button from the main UI.

        ttk.Separator(frame, orient="horizontal").grid(
            row=r, column=0, sticky="ew", pady=8); r += 1

        # ── Status bar ────────────────────────────────────────────────────
        self._status_var = tk.StringVar(value="Load an image to begin.")
        ttk.Label(frame, textvariable=self._status_var,
                  wraplength=CTRL_W - 20,
                  foreground="#555").grid(row=r, column=0, sticky="w"); r += 1

        # ── Progress bar ──────────────────────────────────────────────────
        self._progress = ttk.Progressbar(frame, orient="horizontal",
                                         mode="determinate", length=200)
        self._progress.grid(row=r, column=0, sticky="ew", pady=(4, 0)); r += 1
        self._progress.grid_remove()   # hidden until conversion starts

    def _build_path_canvas(self):
        frame = ttk.LabelFrame(self, text=".thr Path Preview", padding=4)
        frame.grid(row=0, column=2, sticky="nsew", padx=(2, 6), pady=6)
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        self._path_canvas = tk.Canvas(frame, bg=SAND_BG, highlightthickness=0)
        self._path_canvas.grid(row=0, column=0, sticky="nsew")
        self._path_canvas.bind("<Configure>", self._on_path_resize)
        self._draw_placeholder(self._path_canvas,
                               "Path preview will\nappear here after\nconversion")

    @staticmethod
    def _draw_placeholder(canvas: tk.Canvas, text: str):
        canvas.delete("all")
        w = int(canvas["width"])
        h = int(canvas["height"])
        canvas.create_text(w // 2, h // 2, text=text,
                           fill="#b0907a", font=("", 11),
                           justify="center", tags="placeholder")

    # ── Event handlers ────────────────────────────────────────────────────────

    def _load_image(self, path: str):
        _save_config({"pokemon_folder": str(Path(path).parent)})
        self._image_var.set(path)
        self._status("Image loaded. Click 'Preview Edges' to continue.")
        self._cached_polar = None
        self._cached_outline = None
        self._cached_navigate = None
        self._display_polar = None
        self._display_navigate = None
        self._save_btn.config(state="disabled")
        self._save_svg_btn.config(state="disabled")
        self._reset_trace_state(clear_canvas=True)
        self._update_history_note(path)
        def _set_baseline(p=path):
            stem    = Path(p).stem
            history = _load_settings_history()
            if self._use_history and stem in history:
                settings = history[stem]
            else:
                try:
                    settings = core.compute_auto_settings(p)
                except Exception:
                    return
            self.after(0, lambda s=settings: self._apply_auto_settings(s))
        threading.Thread(target=_set_baseline, daemon=True).start()
        c = self._orig_canvas
        size = min(int(c.winfo_width()), int(c.winfo_height()))
        if size < 10:
            size = CANVAS_SIZE
        draw_original_on_canvas(c, path, size)

    def _browse_image(self):
        config = _load_config()
        saved_folder = config.get("pokemon_folder", "")
        initial = saved_folder if saved_folder and Path(saved_folder).exists() else None
        path = filedialog.askopenfilename(
            title="Select Image",
            initialdir=initial,
            filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.tiff *.webp"),
                       ("All files", "*.*")])
        if path:
            self._load_image(path)

    def _next_image(self):
        current = self._image_var.get().strip()
        if not current:
            return
        current_path = Path(current)
        folder = current_path.parent
        images = sorted(
            p for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        )
        if not images:
            return
        try:
            idx = images.index(current_path)
        except ValueError:
            idx = -1
        next_idx = idx + 1
        if next_idx >= len(images):
            self._status("Already at the last image in this folder.")
            return
        self._load_image(str(images[next_idx]))

    def _show_original_for_path(self, path: str):
        c = self._orig_canvas
        size = min(int(c.winfo_width()), int(c.winfo_height()))
        if size < 10:
            size = CANVAS_SIZE
        draw_original_on_canvas(c, path, size)

    def _on_history_toggle(self):
        self._use_history = self._use_history_var.get()
        self._update_history_note(self._image_var.get().strip())

    def _update_history_note(self, path: str):
        """Update the history-status label below the Advanced Settings panel."""
        if not path:
            self._history_note_var.set("")
            return
        stem    = Path(path).stem
        history = _load_settings_history()
        if not self._use_history:
            self._history_note_var.set("History off — using current slider values")
            self._history_note_lbl.config(foreground="#888888")
        elif stem in history:
            entry = history[stem]
            ts    = (entry.get("chosen_at") or "")[:10]
            lbl   = entry.get("label", "")
            self._history_note_var.set(f"History: {lbl}" + (f" ({ts})" if ts else ""))
            self._history_note_lbl.config(foreground="#2a6a2a")
        else:
            self._history_note_var.set("No history — using current slider values")
            self._history_note_lbl.config(foreground="#996600")


    def _apply_auto_settings(self, settings: dict):
        """Update sliders from auto-detected settings (must run on main thread)."""
        self._blur_var.set(settings['blur'])
        self._canny_low_var.set(settings['canny_low'])
        self._canny_hi_var.set(settings['canny_high'])
        self._min_area_var.set(settings['min_area'])
        self._min_length_var.set(settings['min_length'])

    def _on_points_slide(self, val):
        v = int(float(val))
        self._points_var.set(v)
        self._points_label.config(text=str(v))


    def _on_setting_change(self, *_):
        """Called when any control changes — invalidate cached path."""
        self._cached_polar = None
        self._cached_outline = None
        self._cached_navigate = None
        self._display_polar = None
        self._display_navigate = None
        self._save_btn.config(state="disabled")
        self._save_svg_btn.config(state="disabled")
        self._reset_trace_state(clear_canvas=True)

    def _on_edge_resize(self, event):
        if hasattr(self, "_last_contours"):
            self._redraw_edge(*self._last_contours)

    def _on_raw_resize(self, event):
        if hasattr(self, "_last_contours"):
            self._redraw_edge(*self._last_contours)

    def _on_stitch_resize(self, event):
        if hasattr(self, "_last_contours"):
            self._redraw_edge(*self._last_contours)

    def _on_path_resize(self, event):
        if self._cached_polar is not None:
            self._redraw_path(self._cached_polar)

    def _on_trace_resize(self, event):
        if self._trace_path is not None and self._trace_index > 0:
            self._draw_trace_progress(self._trace_index)

    def _on_orig_resize(self, event):
        path = self._image_var.get().strip()
        if path and Path(path).exists():
            c = self._orig_canvas
            size = min(int(c.winfo_width()), int(c.winfo_height()))
            if size >= 10:
                draw_original_on_canvas(c, path, size)

    def _status(self, msg: str, colour: str = "#555"):
        self._status_var.set(msg)
        # find the status label and update colour
        # (simpler to just update via the var; colour ignored for brevity)

    def _apply_table_transform(self, polar: np.ndarray | None) -> np.ndarray | None:
        """Return a safe copy for display caches (GUI keeps raw orientation)."""
        if polar is None:
            return None
        arr = np.asarray(polar).copy()
        return arr

    def _refresh_display_paths(self):
        self._display_polar = self._apply_table_transform(self._cached_polar)
        self._display_navigate = self._apply_table_transform(self._cached_navigate)

    def _reset_trace_state(self, clear_canvas: bool = False):
        self._pause_trace_playback()
        self._trace_path = None
        self._trace_index = 0
        self._trace_internal_update = True
        self._trace_slider_var.set(0)
        self._trace_internal_update = False
        self._trace_status_var.set("0 / 0")
        self._trace_play_btn.config(state="disabled")
        self._trace_pause_btn.config(state="disabled")
        self._trace_reset_btn.config(state="disabled")
        self._trace_slider.config(state="disabled")
        self._trace_speed.config(state="disabled")
        if clear_canvas:
            self._draw_placeholder(self._trace_canvas, "Convert first, then\nPlay to trace .thr path")

    def _start_task(self, kind: str):
        """Begin a new cancellable task session and return its token."""
        self._active_task_id += 1
        self._active_task_kind = kind
        self._cancel_requested = False
        return self._active_task_id

    def _is_task_current(self, task_id: int) -> bool:
        return task_id == self._active_task_id

    def _cancel_active_task(self):
        """Cancel currently running preview/conversion and unlock the UI."""
        if not self._working:
            return
        self._cancel_requested = True
        # Invalidate callbacks from the old worker session.
        self._active_task_id += 1
        kind = self._active_task_kind or "task"
        self._active_task_kind = None
        self._progress.grid_remove()
        self._set_busy(False, f"Cancelled {kind}. You can adjust settings and run again.")

    # ── Background workers ────────────────────────────────────────────────────

    def _run_edge_preview(self):
        path = self._image_var.get().strip()
        if not path:
            messagebox.showwarning("No image", "Please select an image file first.")
            return
        task_id = self._start_task("preview")
        preview_started = time.perf_counter()
        self._set_busy(True, "Detecting edges…")
        self._progress["value"] = 0
        self._progress.grid()

        def worker():
            try:
                # ── Settings resolution: history → auto-detect ────────────
                stem    = Path(path).stem
                history = _load_settings_history()
                if self._use_history and stem in history:
                    entry  = history[stem]
                    blur       = int(entry['blur'])
                    canny_low  = int(entry['canny_low'])
                    canny_high = int(entry['canny_high'])
                    min_area   = float(entry.get('min_area',   float(self._min_area_var.get())))
                    min_length = float(entry.get('min_length', float(self._min_length_var.get())))
                    settings   = dict(blur=blur, canny_low=canny_low, canny_high=canny_high,
                                      min_area=min_area, min_length=min_length)
                    self.after(0, lambda s=settings: self._apply_auto_settings(s))
                    self._settings_source = "history"
                else:
                    # Use whatever the sliders currently show — no auto-detect on preview
                    blur       = int(self._blur_var.get())
                    canny_low  = int(self._canny_low_var.get())
                    canny_high = int(self._canny_hi_var.get())
                    min_area   = float(self._min_area_var.get())
                    min_length = float(self._min_length_var.get())
                    self._settings_source = ""

                gray, binary, raw_contours, contours, img_w, img_h = core.extract_preview_data(
                    image_path=path,
                    mode=self._mode_var.get(),
                    blur=blur,
                    canny_low=canny_low,
                    canny_high=canny_high,
                    threshold=int(self._thresh_var.get()),
                    invert=self._invert_var.get(),
                    min_area=min_area,
                    min_length=min_length,
                    smooth=int(self._smooth_var.get()),
                    thin=self._thin_var.get(),
                    straighten=int(self._straighten_var.get()) / 100.0,
                )
                # Stitching is intentionally skipped here — it accounts for the vast
                # majority of processing time and will be run anyway during Convert.
                draw_only = contours
                stitched  = []
                kinds     = []
                self.after(0, lambda b=binary, rc=raw_contours, c=contours, w=img_w, h=img_h,
                           d=draw_only, st=stitched, k=kinds, tid=task_id,
                           elapsed=time.perf_counter() - preview_started:
                           self._edge_preview_done(tid, b, rc, c, w, h, len(c), d, st, k, elapsed))
            except Exception as e:
                if str(e) == "Cancelled":
                    return
                self.after(0, lambda msg=str(e), tid=task_id: self._on_error(msg, tid))

        threading.Thread(target=worker, daemon=True).start()

    def _edge_preview_done(self, task_id, binary, raw_contours, contours, img_w, img_h,
                           n_contours, draw_only, stitched, kinds, elapsed_s):
        if not self._is_task_current(task_id):
            return
        self._progress.grid_remove()
        self._last_contours = (binary, raw_contours, contours, img_w, img_h,
                               draw_only, stitched, kinds)
        self._redraw_edge(binary, raw_contours, contours, img_w, img_h,
                          draw_only, stitched, kinds)
        src_notes = {"history": " (settings from history)", "auto": " (settings auto-detected)"}
        auto_note = src_notes.get(self._settings_source, "")
        self._set_busy(False, f"Found {n_contours} contour(s) in {elapsed_s:.2f}s{auto_note}. "
                              f"Click 'Convert & Preview Path' to stitch and generate the full path.")

    def _redraw_edge(self, binary, raw_contours, contours, img_w, img_h,
                     draw_only, stitched, kinds):
        # ── Raw contours (top-right) ─────────────────────────────────────
        c = self._raw_canvas
        size = min(int(c.winfo_width()), int(c.winfo_height()))
        if size < 10:
            size = CANVAS_SIZE
        c.delete("all")
        draw_contours_on_canvas(c, raw_contours, img_w, img_h, size)

        # ── Isolated contour sections (bottom-left) ──────────────────────
        c = self._edge_canvas
        size = min(int(c.winfo_width()), int(c.winfo_height()))
        if size < 10:
            size = CANVAS_SIZE
        c.delete("all")
        draw_contours_on_canvas(c, draw_only, img_w, img_h, size)

        # Outermost-shape pane removed by request.

    def _run_conversion(self):
        path = self._image_var.get().strip()
        if not path:
            messagebox.showwarning("No image", "Please select an image file first.")
            return
        task_id = self._start_task("conversion")
        self._set_busy(True, "Converting image to .thr path…")
        self._progress["value"] = 0
        self._progress.grid()          # show progress bar

        build_kwargs = self._collect_build_kwargs()
        def on_progress(done, total):
            if self._cancel_requested:
                raise RuntimeError("Cancelled")
            self.after(0, lambda d=done, t=total, tid=task_id: self._update_progress("Convert", d, t, tid))

        def worker():
            try:
                result = self._build_path_result(path, build_kwargs, on_progress)
                self.after(0, lambda r=result, tid=task_id: self._conversion_done(tid, r))
            except Exception as e:
                if str(e) == "Cancelled":
                    return
                self.after(0, lambda msg=str(e), tid=task_id: self._on_error(msg, tid))

        threading.Thread(target=worker, daemon=True).start()

    def _run_batch_conversion(self):
        current = Path(self._image_var.get().strip()) if self._image_var.get().strip() else None
        initial_dir = str(current.parent) if current and current.exists() else str(Path.home() / "Pictures" / "Pokemon")
        source_dir = filedialog.askdirectory(title="Select Pokemon image folder", initialdir=initial_dir)
        if not source_dir:
            return

        src = Path(source_dir)
        out_dir = src / "thr Files"
        images = sorted([p for p in src.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS])
        if not images:
            messagebox.showwarning("No images", f"No images found in:\n{src}")
            return

        out_dir.mkdir(parents=True, exist_ok=True)
        preview_dir = out_dir / "path previews"
        preview_dir.mkdir(parents=True, exist_ok=True)
        task_id = self._start_task("batch conversion")
        self._batch_total = len(images)
        self._batch_index = 0
        self._batch_name = ""
        self._set_busy(True, f"Batch converting {len(images)} image(s)…")
        self._progress["value"] = 0
        self._progress.grid()

        mirror_enabled = bool(self._mirror_var.get())
        entry_mode = self._entry_var.get()

        def worker():
            ok = 0
            skipped = 0
            failed: list[str] = []
            total = len(images)
            for idx, img in enumerate(images, start=1):
                if self._cancel_requested:
                    raise RuntimeError("Cancelled")

                out_path = out_dir / f"{img.stem}.thr"
                if out_path.exists():
                    skipped += 1
                    self._batch_index = idx
                    self._batch_name = img.name
                    self.after(0, lambda i=idx, t=total, n=img.name:
                               self._status_var.set(f"Batch {i}/{t}: {n} (skipped - .thr exists)"))
                    continue

                self._batch_index = idx
                self._batch_name = img.name
                self.after(0, lambda p=str(img): self._image_var.set(p))
                self.after(0, lambda p=str(img): self._show_original_for_path(p))
                self.after(0, lambda i=idx, t=total, n=img.name:
                           self._status_var.set(f"Batch {i}/{t}: {n} (preview)…"))

                try:
                    build_kwargs, auto_settings = self._collect_build_kwargs_for_image(str(img))
                    if auto_settings is not None:
                        self.after(0, lambda s=auto_settings: self._apply_auto_settings(s))

                    # Run the same edge extraction stage as Preview so the UI shows progress per Pokemon.
                    gray, binary, raw_contours, contours, img_w, img_h = core.extract_preview_data(
                        image_path=str(img),
                        mode=build_kwargs["mode"],
                        blur=build_kwargs["blur"],
                        canny_low=build_kwargs["canny_low"],
                        canny_high=build_kwargs["canny_high"],
                        threshold=build_kwargs["threshold"],
                        invert=build_kwargs["invert"],
                        min_area=build_kwargs["min_area"],
                        min_length=build_kwargs["min_length"],
                        smooth=build_kwargs["smooth"],
                        thin=build_kwargs["thin"],
                        straighten=build_kwargs["straighten"],
                    )
                    if self._cancel_requested:
                        raise RuntimeError("Cancelled")
                    self.after(0, lambda b=binary, rc=raw_contours, c=contours, w=img_w, h=img_h:
                               self._apply_batch_preview(b, rc, c, w, h))

                    def on_progress(done, total_points):
                        if self._cancel_requested:
                            raise RuntimeError("Cancelled")
                        self.after(0, lambda d=done, t=total_points, tid=task_id:
                                   self._update_progress("Convert", d, t, tid))

                    result = self._build_path_result(str(img), build_kwargs, progress_cb=on_progress)
                    if self._cancel_requested:
                        raise RuntimeError("Cancelled")
                    self.after(0, lambda r=result: self._apply_batch_result_preview(r))
                    final = self._build_final_thr_from_result(result, mirror_enabled, entry_mode)
                    comment = (f"Generated by SandArtGUI.py\n"
                               f"Source: {img.name}\n"
                               f"Engine: SandArt\n"
                               f"Points: {len(final)}")
                    core.write_thr(final, str(out_path), comment=comment)
                    # Extract separate components for colored preview
                    navigate = result.get("navigate")
                    outline = result.get("outline")
                    n_outline = int(result.get("n_outline", 0) or 0)
                    save_thr_preview_png(final, str(preview_dir / f"{img.stem}.png"),
                                       navigate=navigate, outline=outline, n_outline=n_outline,
                                       mirror_enabled=mirror_enabled)
                    ok += 1
                except Exception as e:
                    if str(e) == "Cancelled":
                        raise
                    failed.append(f"{img.name}: {e}")

            def done_callback():
                if not self._is_task_current(task_id):
                    return
                self._progress.grid_remove()
                self._set_busy(False, f"Batch complete: {ok} saved, {skipped} skipped, {len(failed)} failed.")
                if failed:
                    sample = "\n".join(failed[:10])
                    more = "" if len(failed) <= 10 else f"\n...and {len(failed) - 10} more"
                    messagebox.showwarning(
                        "Batch conversion finished with errors",
                        f"Saved: {ok}\nSkipped (already existed): {skipped}\nFailed: {len(failed)}\n\nFailures:\n{sample}{more}",
                    )
                else:
                    messagebox.showinfo(
                        "Batch conversion complete",
                        f"Saved: {ok}\nSkipped (already existed): {skipped}\nFailed: 0\n\nFolder:\n{out_dir}",
                    )

            self.after(0, done_callback)

        def guarded_worker():
            try:
                worker()
            except Exception as e:
                if str(e) == "Cancelled":
                    return
                self.after(0, lambda msg=str(e), tid=task_id: self._on_error(msg, tid))

        threading.Thread(target=guarded_worker, daemon=True).start()

    def _apply_batch_preview(self, binary, raw_contours, contours, img_w, img_h):
        draw_only = contours
        stitched = []
        kinds = []
        self._last_contours = (binary, raw_contours, contours, img_w, img_h,
                               draw_only, stitched, kinds)
        self._redraw_edge(binary, raw_contours, contours, img_w, img_h,
                          draw_only, stitched, kinds)

    def _apply_batch_result_preview(self, result):
        if isinstance(result, dict):
            polar = result['polar']
            self._cached_outline = result.get('outline')
            self._cached_n_outline = result.get('n_outline', 0)
            self._cached_navigate = result.get('navigate')
        else:
            polar = np.asarray(result)
            self._cached_outline = None
            self._cached_n_outline = 0
            self._cached_navigate = None
        self._cached_polar = polar
        self._refresh_display_paths()
        self._redraw_path(polar)

    def _collect_build_kwargs(self) -> dict:
        return {
            "mode": self._mode_var.get(),
            "blur": int(self._blur_var.get()),
            "canny_low": int(self._canny_low_var.get()),
            "canny_high": int(self._canny_hi_var.get()),
            "threshold": int(self._thresh_var.get()),
            "invert": self._invert_var.get(),
            "min_area": float(self._min_area_var.get()),
            "min_length": float(self._min_length_var.get()),
            "smooth": int(self._smooth_var.get()),
            "thin": self._thin_var.get(),
            "straighten": int(self._straighten_var.get()) / 100.0,
            "max_points": int(self._points_var.get()),
            "outside_in": self._outside_in_var.get(),
            "add_home": False,
            "complexity_pct": int(self._complexity_var.get()),
            "strict_mode": self._strict_var.get(),
            "fill": int(self._fill_var.get()) / 100.0,
            "ball_start": _entry_to_ball_start(self._entry_var.get()),
        }

    def _collect_build_kwargs_for_image(self, image_path: str) -> tuple[dict, dict | None]:
        kwargs = self._collect_build_kwargs()
        stem    = Path(image_path).stem
        history = _load_settings_history()
        if self._use_history and stem in history:
            entry = history[stem]
            settings = {
                "blur":       int(entry["blur"]),
                "canny_low":  int(entry["canny_low"]),
                "canny_high": int(entry["canny_high"]),
                "smooth":     int(entry.get("smooth",     kwargs.get("smooth",     0))),
                "min_area":   float(entry.get("min_area",   kwargs.get("min_area",   10.0))),
                "min_length": float(entry.get("min_length", kwargs.get("min_length", 20.0))),
            }
            kwargs.update(settings)
        return kwargs, history.get(stem) if self._use_history else None

    def _build_path_result(self, image_path: str, build_kwargs: dict, progress_cb=None):
        kwargs = dict(build_kwargs)
        kwargs["image_path"] = image_path
        kwargs["progress_cb"] = progress_cb
        return core.build_thr_path(**kwargs)

    def _build_final_thr_from_result(self, result, mirror_enabled: bool, entry_mode: str) -> np.ndarray:
        if isinstance(result, dict):
            polar = np.asarray(result.get("polar"))
            n_ol = int(result.get("n_outline", 0) or 0)
            navigate = result.get("navigate")
        else:
            polar = np.asarray(result)
            n_ol = 0
            navigate = None

        if polar is None or len(polar) < 2:
            raise ValueError("Converted path is empty")

        n_ol = max(0, min(n_ol, len(polar)))
        polar_for_table = polar.copy()
        if mirror_enabled:
            polar_for_table[:, 0] = math.pi - polar_for_table[:, 0]
        polar_for_table[:, 0] -= math.pi / 2

        parts = []
        entry_l = entry_mode.lower()
        if "none" not in entry_l:
            if navigate is not None and len(navigate) > 1:
                nav_for_table = np.asarray(navigate).copy()
                if mirror_enabled:
                    nav_for_table[:, 0] = math.pi - nav_for_table[:, 0]
                nav_for_table[:, 0] -= math.pi / 2
                parts.append(nav_for_table)
            else:
                nav = self._build_entry_path(polar_for_table, ball_at_center="center" in entry_l)
                if nav is not None and len(nav) > 1:
                    parts.append(nav)

        if n_ol > 0:
            parts.append(np.vstack([polar_for_table[:n_ol], polar_for_table[0:1]]))

        full_tail = polar_for_table[n_ol:] if n_ol > 0 else polar_for_table
        if len(full_tail) > 1:
            parts.append(full_tail)

        full = np.vstack(parts) if len(parts) > 1 else parts[0]
        if "center" in entry_l and len(full) > 0:
            anchor = np.array([CENTER_START_THETA, CENTER_START_RHO], dtype=full.dtype)
            if float(full[0, 1]) <= (CENTER_START_RHO * 4.0):
                full[0] = anchor
            else:
                full = np.vstack([anchor, full])
        return self._trim_duplicate_suffix_edges(full)

    def _update_progress(self, phase: str, done: int, total: int, task_id: int | None = None):
        if task_id is not None and not self._is_task_current(task_id):
            return
        pct = int(100 * done / max(total, 1))
        self._progress["value"] = pct
        if self._batch_total > 0:
            self._status_var.set(
                f"Batch {self._batch_index}/{self._batch_total} [{self._batch_name}] — "
                f"{phase}: {done}/{total}  ({pct}%)"
            )
        else:
            self._status_var.set(f"{phase}: {done}/{total}  ({pct}%)")
        self.update_idletasks()

    def _conversion_done(self, task_id, result):
        if not self._is_task_current(task_id):
            return
        if isinstance(result, dict):
            polar = result['polar']
            self._cached_outline   = result.get('outline')    # may be None
            self._cached_n_outline = result.get('n_outline', 0)
            self._cached_navigate  = result.get('navigate')   # may be None
        else:
            polar = np.asarray(result)
            self._cached_outline   = None
            self._cached_n_outline = 0
            self._cached_navigate  = None
        self._cached_polar = polar
        self._refresh_display_paths()
        self._reset_trace_state(clear_canvas=False)
        try:
            self._trace_path = self._build_preview_trace_path()
        except Exception:
            self._trace_path = None
        if self._trace_path is not None and len(self._trace_path) > 1:
            self._trace_index = 1
            self._trace_play_btn.config(state="normal")
            self._trace_pause_btn.config(state="normal")
            self._trace_reset_btn.config(state="normal")
            self._trace_slider.config(state="normal")
            self._trace_speed.config(state="normal")
            self._draw_trace_progress(self._trace_index)
        self._redraw_path(polar)
        self._save_btn.config(state="normal")
        self._save_svg_btn.config(state="normal")
        self._progress.grid_remove()   # hide progress bar

        # Rho statistics — tell the user how much of the table is actually used
        rhos = polar[:, 1]
        max_rho  = float(np.max(rhos))
        p95_rho  = float(np.percentile(rhos, 95))
        fill_pct = round(max_rho * 100, 1)
        trimmed_note = ""
        if self._last_preview_raw_points > 0:
            trimmed_note = (f" Trimmed tail: -{self._last_preview_trimmed_points} "
                            f"({self._last_preview_raw_points}→{self._last_preview_final_points} pts).")
        self._set_busy(False,
                       f"Done! {self._last_preview_final_points or len(polar)} waypoints.{trimmed_note} "
                       f"Table fill: {fill_pct}% (max ρ={max_rho:.3f}, "
                       f"95th pct ρ={p95_rho:.3f}). "
                       f"Click 'Save .thr File…' to export.")

    def _redraw_path(self, polar: np.ndarray):
        c = self._path_canvas
        size = min(int(c.winfo_width()), int(c.winfo_height()))
        if size < 10:
            size = CANVAS_SIZE
        c.delete("all")

        m = 4
        c.create_oval(m, m, size - m, size - m,
                      outline=CIRCLE_COL, width=1, tags="circle")

        disp_polar = self._display_polar if self._display_polar is not None else polar
        if disp_polar is None or len(disp_polar) < 2:
            return

        def _seg_to_coords(arr):
            out = []
            for theta, rho in arr:
                x = rho * math.cos(theta)
                y = rho * math.sin(theta)
                px2, py2 = _canvas_coords(x, y, size)
                out.extend([px2, py2])
            return out

        n_ol      = self._cached_n_outline
        entry_sel = self._entry_var.get()
        nav_seg   = self._display_navigate if self._display_navigate is not None else self._cached_navigate

        # ── Find the optimal navigate-to-outline landing index ───────────────
        #
        # Cost function: cost(i) = |ρ_i − ρ_start| × APPROACH_WEIGHT + i
        #   • ρ-distance term  : penalises crossing fresh sand on the approach
        #   • index term       : penalises a long reverse-trace back to index 0
        #
        # This naturally picks an early, physically-nearby point — so the
        # approach leg is short AND the backward trace to polar[0] is short.
        # No hard window cap is needed; the index penalty handles it.
        APPROACH_WEIGHT = 30   # approach steps per unit ρ (legacy fallback)
        nearest_idx = -1
        start_rho   = 0.0
        if (nav_seg is None or len(nav_seg) < 2) and "none" not in entry_sel.lower():
            rhos    = disp_polar[:, 1]
            indices = np.arange(len(disp_polar), dtype=float)
            if "center" in entry_sel.lower():
                costs       = rhos * APPROACH_WEIGHT + indices
                nearest_idx = int(np.argmin(costs))
                start_rho   = 0.0
            else:
                costs       = (1.0 - rhos) * APPROACH_WEIGHT + indices
                nearest_idx = int(np.argmin(costs))
                start_rho   = 1.0

        # ── Three independent visual layers ─────────────────────────────────
        #
        # The preview mirrors the three-path THR structure:
        #
        #   BLACK  = full drawing  polar[0 .. N-1]          (drawn first / bottom)
        #   BLUE   = outline loop  polar[0 .. n_ol-1]        (on top of black)
        #   RED    = navigate path:  approach leg  +
        #                            reverse trace polar[nearest_idx .. 0]
        #            Only the portion from landing_idx back to index 0 is shown;
        #            with the cost function nearest_idx is small, so the red
        #            segment is always short.
        #
        # Draw order:  BLACK → BLUE → RED trace → RED approach + dot

        black_seg     = disp_polar       # full path (all of it — shown in black)
        blue_seg      = disp_polar[:n_ol] if n_ol > 0 else None
        # Red trace: polar[0..nearest_idx] traversed in display-forward order.
        # Because nearest_idx is small (cost function), this is a tiny segment.
        red_trace_seg = nav_seg if (nav_seg is not None and len(nav_seg) >= 2) else \
            (disp_polar[:nearest_idx + 1] if nearest_idx > 0 else None)

        # Phase 1 — BLACK: entire drawing (bottom layer)
        if black_seg is not None and len(black_seg) >= 2:
            mc = _seg_to_coords(black_seg)
            if len(mc) >= 4:
                c.create_line(*mc, fill=PATH_COL, width=1,
                              smooth=False, tags="path")

        # Phase 2 — BLUE: outline loop (on top of black)
        if blue_seg is not None and len(blue_seg) >= 2:
            bc = _seg_to_coords(blue_seg)
            if len(bc) >= 4:
                c.create_line(*bc, fill="#1155cc", width=2,
                              smooth=False, tags="path")

        # Phase 3 — RED trace: the path the ball walks in reverse during entry
        #            (on top of blue — this is small because nearest_idx is small)
        if red_trace_seg is not None and len(red_trace_seg) >= 2:
            rc = _seg_to_coords(red_trace_seg)
            if len(rc) >= 4:
                c.create_line(*rc, fill="#cc2200", width=2,
                              smooth=False, tags="path")

        # Phase 4 — RED approach leg + landing dot (always on top)
        if nav_seg is not None and len(nav_seg) >= 2:
            # Start marker at ball position = first navigate point.
            btheta = float(nav_seg[0, 0]); brho = float(nav_seg[0, 1])
            bx, by = _canvas_coords(brho * math.cos(btheta), brho * math.sin(btheta), size)
            c.create_oval(bx - 5, by - 5, bx + 5, by + 5,
                          fill="#cc2200", outline="white", width=1, tags="path")

            # Landing marker where navigate reaches outline start = last navigate point.
            ltheta = float(nav_seg[-1, 0]); lrho = float(nav_seg[-1, 1])
            lx, ly = _canvas_coords(lrho * math.cos(ltheta), lrho * math.sin(ltheta), size)
            c.create_oval(lx - 4, ly - 4, lx + 4, ly + 4,
                          fill="#cc2200", outline="white", width=1, tags="path")
        elif nearest_idx >= 0:
            nearest_theta = float(disp_polar[nearest_idx, 0])
            nearest_rho   = float(disp_polar[nearest_idx, 1])

            n_app    = max(5, int(abs(nearest_rho - start_rho) * APPROACH_WEIGHT))
            approach = np.column_stack([
                np.full(n_app, nearest_theta),
                np.linspace(start_rho, nearest_rho, n_app),
            ])
            ec = _seg_to_coords(approach)
            if len(ec) >= 4:
                c.create_line(*ec, fill="#cc2200", width=2,
                              smooth=False, tags="path")

            # Dot at ball start position (ρ=0 center, or ρ=1 edge)
            bx, by = _canvas_coords(0, 0, size) if start_rho == 0.0 else \
                     _canvas_coords(math.cos(nearest_theta),
                                    math.sin(nearest_theta), size)
            c.create_oval(bx - 5, by - 5, bx + 5, by + 5,
                          fill="#cc2200", outline="white", width=1, tags="path")

            # Dot at landing point on existing path
            lx  = nearest_rho * math.cos(nearest_theta)
            lyt = nearest_rho * math.sin(nearest_theta)
            dpx, dpy = _canvas_coords(lx, lyt, size)
            c.create_oval(dpx - 4, dpy - 4, dpx + 4, dpy + 4,
                          fill="#cc2200", outline="white", width=1, tags="path")

        # Shared drawing start marker: black (largest), blue, then red (smallest)
        # so all three phase starts are visible at the same point.
        if len(disp_polar) > 0:
            start_theta = float(disp_polar[0, 0])
            start_rho   = float(disp_polar[0, 1])
            sx = start_rho * math.cos(start_theta)
            sy = start_rho * math.sin(start_theta)
            spx, spy = _canvas_coords(sx, sy, size)
            c.create_oval(spx - 7, spy - 7, spx + 7, spy + 7,
                          fill=PATH_COL, outline="white", width=1, tags="path")
            c.create_oval(spx - 5, spy - 5, spx + 5, spy + 5,
                          fill="#1155cc", outline="white", width=1, tags="path")
            c.create_oval(spx - 3, spy - 3, spx + 3, spy + 3,
                          fill="#cc2200", outline="white", width=1, tags="path")

        # ── Legend ───────────────────────────────────────────────────────────
        ly = size - 6
        c.create_text(6,   ly, text="●", fill="#cc2200", font=("", 8),
                      anchor="sw", tags="path")
        c.create_text(16,  ly, text="entry", fill="#666", font=("", 7),
                      anchor="sw", tags="path")
        c.create_text(48,  ly, text="■", fill="#1155cc", font=("", 8),
                      anchor="sw", tags="path")
        c.create_text(60,  ly, text="outline", fill="#666", font=("", 7),
                      anchor="sw", tags="path")
        c.create_text(100, ly, text="■", fill=PATH_COL, font=("", 8),
                      anchor="sw", tags="path")
        c.create_text(112, ly, text="drawing", fill="#666", font=("", 7),
                      anchor="sw", tags="path")

    def _start_trace_playback(self):
        if self._cached_polar is None:
            return
        if self._trace_path is None or len(self._trace_path) < 2:
            self._trace_path = self._build_final_thr_path()
        if self._trace_index <= 0 or self._trace_index >= len(self._trace_path):
            self._trace_index = 1
        self._trace_running = True
        self._tick_trace_playback()

    def _pause_trace_playback(self):
        self._trace_running = False
        if self._trace_after_id is not None:
            self.after_cancel(self._trace_after_id)
            self._trace_after_id = None

    def _reset_trace_playback(self):
        self._pause_trace_playback()
        if self._trace_path is None or len(self._trace_path) < 2:
            self._trace_status_var.set("0 / 0")
            return
        self._trace_index = 1
        self._draw_trace_progress(self._trace_index)

    def _on_trace_seek(self, value):
        if self._trace_internal_update:
            return
        if self._trace_path is None or len(self._trace_path) < 2:
            return
        self._pause_trace_playback()
        pct = max(0.0, min(1000.0, float(value)))
        n = len(self._trace_path)
        self._trace_index = max(1, min(n, 1 + int((n - 1) * (pct / 1000.0))))
        self._draw_trace_progress(self._trace_index)

    def _tick_trace_playback(self):
        if not self._trace_running or self._trace_path is None:
            return
        n = len(self._trace_path)
        if n < 2:
            self._trace_running = False
            return
        step = max(1, int(self._trace_speed_var.get()))
        self._trace_index = min(n, self._trace_index + step)
        self._draw_trace_progress(self._trace_index)
        if self._trace_index >= n:
            self._trace_running = False
            self._trace_after_id = None
            return
        self._trace_after_id = self.after(33, self._tick_trace_playback)

    def _draw_trace_progress(self, idx: int):
        if self._trace_path is None or len(self._trace_path) < 2:
            return
        n = len(self._trace_path)
        idx = max(1, min(n, idx))
        c = self._trace_canvas
        size = min(int(c.winfo_width()), int(c.winfo_height()))
        if size < 10:
            size = CANVAS_SIZE
        draw_thr_on_canvas(c, self._trace_path[:idx], size)

        # Draw a larger playhead marker at the current trace point.
        theta = float(self._trace_path[idx - 1, 0])
        rho = float(self._trace_path[idx - 1, 1])
        px, py = _canvas_coords(rho * math.cos(theta), rho * math.sin(theta), size)
        r = 6
        c.create_oval(px - r, py - r, px + r, py + r,
                      fill="#cc2200", outline="white", width=1, tags="path")

        self._trace_internal_update = True
        self._trace_slider_var.set(int(1000 * (idx - 1) / max(n - 1, 1)))
        self._trace_internal_update = False
        self._trace_status_var.set(f"{idx:,} / {n:,}")


    def _build_final_thr_path(self) -> np.ndarray:
        """Assemble the exact path that will be written to .thr."""
        if self._cached_polar is None or len(self._cached_polar) < 2:
            raise ValueError("No converted path available yet.")

        n_ol = max(0, min(int(self._cached_n_outline), len(self._cached_polar)))
        polar_for_table = self._cached_polar.copy()
        if self._mirror_var.get():
            polar_for_table[:, 0] = math.pi - polar_for_table[:, 0]
        polar_for_table[:, 0] -= math.pi / 2

        parts = []
        entry = self._entry_var.get()
        if "none" not in entry.lower():
            if self._cached_navigate is not None and len(self._cached_navigate) > 1:
                nav_for_table = self._cached_navigate.copy()
                if self._mirror_var.get():
                    nav_for_table[:, 0] = math.pi - nav_for_table[:, 0]
                nav_for_table[:, 0] -= math.pi / 2
                parts.append(nav_for_table)
            else:
                navigate_path = self._build_entry_path(
                    polar_for_table,
                    ball_at_center="center" in entry.lower(),
                )
                if navigate_path is not None and len(navigate_path) > 1:
                    parts.append(navigate_path)

        if n_ol > 0:
            outline_closed = np.vstack([
                polar_for_table[:n_ol],
                polar_for_table[0:1],
            ])
            parts.append(outline_closed)

        # Avoid replaying the leading outline prefix in the full path.
        full_tail = polar_for_table[n_ol:] if n_ol > 0 else polar_for_table
        if len(full_tail) > 1:
            parts.append(full_tail)
        full = np.vstack(parts) if len(parts) > 1 else parts[0]

        # Pin a deterministic heading when starting from centre.
        # A true rho=0 start lets downstream players pick rotation from prior state.
        if "center" in entry.lower() and len(full) > 0:
            anchor = np.array([CENTER_START_THETA, CENTER_START_RHO], dtype=full.dtype)
            if float(full[0, 1]) <= (CENTER_START_RHO * 4.0):
                full[0] = anchor
            else:
                full = np.vstack([anchor, full])

        return self._trim_duplicate_suffix_edges(full)

    def _build_preview_trace_path(self) -> np.ndarray:
        """Assemble the same phase order as THR, but in raw preview orientation."""
        if self._cached_polar is None or len(self._cached_polar) < 2:
            raise ValueError("No converted path available yet.")

        n_ol = max(0, min(int(self._cached_n_outline), len(self._cached_polar)))
        polar_preview = self._cached_polar.copy()
        parts = []

        entry = self._entry_var.get()
        if "none" not in entry.lower():
            if self._cached_navigate is not None and len(self._cached_navigate) > 1:
                parts.append(self._cached_navigate.copy())
            else:
                navigate_path = self._build_entry_path(
                    polar_preview,
                    ball_at_center="center" in entry.lower(),
                )
                if navigate_path is not None and len(navigate_path) > 1:
                    parts.append(navigate_path)

        if n_ol > 0:
            outline_closed = np.vstack([
                polar_preview[:n_ol],
                polar_preview[0:1],
            ])
            parts.append(outline_closed)

        # Avoid replaying the leading outline prefix in the full path.
        full_tail = polar_preview[n_ol:] if n_ol > 0 else polar_preview
        if len(full_tail) > 1:
            parts.append(full_tail)
        full = np.vstack(parts) if len(parts) > 1 else parts[0]
        trimmed = self._trim_duplicate_suffix_edges(full)
        self._last_preview_raw_points = len(full)
        self._last_preview_final_points = len(trimmed)
        self._last_preview_trimmed_points = max(0, len(full) - len(trimmed))
        return trimmed

    @staticmethod
    def _trim_duplicate_suffix_edges(
        polar: np.ndarray,
        q: int = 3,
        window_size: int = 5,
        min_dups_in_window: int = 4,
    ) -> np.ndarray:
        """Trim trailing retrace with tolerant backward matching.

        Backward-only behavior is preserved, but instead of requiring every
        edge at the end to be an exact duplicate, trimming can continue when
        the trailing window is mostly duplicates (default: 4 of last 5).
        """
        if polar is None or len(polar) < 4:
            return polar

        def _qxy(row):
            theta = float(row[0])
            rho = float(row[1])
            x = rho * math.cos(theta)
            y = rho * math.sin(theta)
            return (round(x, q), round(y, q))

        pts = [_qxy(row) for row in polar]
        edges = []
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            if a == b:
                edges.append(None)
            else:
                edges.append((a, b) if a <= b else (b, a))

        first_seen = {}
        for i, e in enumerate(edges):
            if e is None:
                continue
            if e not in first_seen:
                first_seen[e] = i

        # Duplicate flags per edge: True means this edge already appeared earlier.
        is_dup = []
        for i, e in enumerate(edges):
            if e is None:
                is_dup.append(True)
            else:
                is_dup.append(first_seen.get(e, i) < i)

        cut = len(polar)
        for i in range(len(edges) - 1, -1, -1):
            # Primary rule: exact duplicate edge at the tail.
            if is_dup[i]:
                cut = i + 1
                continue

            # Tolerant rule: if the recent tail window is mostly duplicates,
            # keep trimming backward (e.g., 4 of last 5 edges).
            ws = max(0, i - window_size + 1)
            win_len = i - ws + 1
            if win_len >= window_size:
                dup_count = sum(1 for j in range(ws, i + 1) if is_dup[j])
                if dup_count >= min_dups_in_window:
                    cut = i + 1
                    continue

            break

        return polar[:max(2, cut)]

    @staticmethod
    def _build_entry_path(polar_path: np.ndarray,
                          ball_at_center: bool) -> np.ndarray | None:
        """
        Build the 'navigate to outline' entry path.

        Algorithm
        ---------
        1. Score every point in the full path with a combined cost:

               cost(i) = |ρ_i − ρ_start| × APPROACH_WEIGHT + i

           •  ρ-distance term  : approach leg length on fresh sand
           •  index term       : reverse-trace length back to polar[0]

           argmin(cost) gives the optimal landing point — physically close
           to the ball AND early in the path, so both the approach AND the
           backward trace are short.

        2. Straight radial approach from ball position to landing point
           (constant θ, ρ sweeps from start_rho to landing rho).
           This is the ONLY leg that may cross undrawn sand.

        3. Reverse-trace from landing point backward to index 0,
           following the pre-planned islands and bridges.  Every mark
           made here will be redrawn when the main drawing runs forward.

        Returns an (N, 2) polar array that ends at polar_path[0], or None.
        """
        if polar_path is None or len(polar_path) < 2:
            return None

        APPROACH_WEIGHT = 30   # approach steps per unit ρ (matches regeneration)
        rhos    = polar_path[:, 1]
        indices = np.arange(len(polar_path), dtype=float)

        if ball_at_center:
            costs     = rhos * APPROACH_WEIGHT + indices
            start_rho = 0.0
        else:
            costs     = (1.0 - rhos) * APPROACH_WEIGHT + indices
            start_rho = 1.0

        nearest_idx   = int(np.argmin(costs))
        nearest_theta = float(polar_path[nearest_idx, 0])
        nearest_rho   = float(polar_path[nearest_idx, 1])

        # Straight radial approach — only fresh-sand marks made in entry.
        n_approach = max(5, int(abs(nearest_rho - start_rho) * APPROACH_WEIGHT))
        approach = np.column_stack([
            np.full(n_approach, nearest_theta),
            np.linspace(start_rho, nearest_rho, n_approach),
        ])

        if nearest_idx == 0:
            return approach   # landing is already the drawing start

        # Reverse-trace the pre-planned path from landing back to index 0.
        trace = polar_path[nearest_idx::-1]   # shape (nearest_idx+1, 2)
        return np.vstack([approach, trace[1:]])

    def _save_thr(self):
        if self._cached_polar is None:
            return
        src = self._image_var.get().strip()
        default = Path(src).stem + ".thr" if src else "output.thr"
        thr_dir = Path(src).parent / "thr Files" if src else Path.cwd()
        thr_dir.mkdir(parents=True, exist_ok=True)
        out_path = filedialog.asksaveasfilename(
            title="Save .thr File",
            defaultextension=".thr",
            initialdir=str(thr_dir),
            initialfile=default,
            filetypes=[("Theta-Rho files", "*.thr"), ("All files", "*.*")])
        if not out_path:
            return
        try:
            final = self._build_final_thr_path()
            comment = (f"Generated by SandArtGUI.py\n"
                       f"Source: {Path(src).name}\n"
                       f"Engine: SandArt\n"
                       f"Points: {len(final)}")
            core.write_thr(final, out_path, comment=comment)
            preview_dir = Path(out_path).parent / "path previews"
            preview_dir.mkdir(parents=True, exist_ok=True)
            # Extract cached components for colored preview
            navigate = self._cached_navigate
            outline = self._cached_outline
            n_outline = self._cached_n_outline
            save_thr_preview_png(final, str(preview_dir / f"{Path(out_path).stem}.png"),
                               navigate=navigate, outline=outline, n_outline=n_outline,
                               mirror_enabled=self._mirror_var.get())
            self._status(f"Saved: {Path(out_path).name}")
        except Exception as e:
            self._on_error(str(e))

    def _save_svg(self):
        if self._cached_polar is None:
            return
        src = self._image_var.get().strip()
        default = Path(src).stem + ".svg" if src else "output.svg"
        out_path = filedialog.asksaveasfilename(
            title="Save .svg File",
            defaultextension=".svg",
            initialfile=default,
            filetypes=[("SVG files", "*.svg"), ("All files", "*.*")])
        if not out_path:
            return
        try:
            comment = (f"Generated by SandArtGUI.py | "
                       f"Source: {Path(src).name} | "
                       f"Engine: SandArt | "
                       f"Points: {len(self._cached_polar)}")
            core.write_svg(self._cached_polar, out_path, comment=comment)
            self._status(f"Saved: {Path(out_path).name}")
        except Exception as e:
            self._on_error(str(e))

    # ── Settings picker ───────────────────────────────────────────────────────

    def _run_picker(self):
        """Open the settings picker for the currently loaded image."""
        image_path = self._image_var.get().strip()
        if not image_path or not Path(image_path).exists():
            messagebox.showwarning("No image", "Load an image first.")
            return
        if self._working:
            messagebox.showwarning("Busy", "Wait for the current task to finish.")
            return

        self._status("Computing auto settings…")
        self.update_idletasks()
        try:
            auto_settings = core.compute_auto_settings(image_path)
        except Exception as exc:
            messagebox.showerror("Error", f"Auto-settings failed:\n{exc}")
            return

        base_kwargs   = self._collect_build_kwargs()
        mirror_enabled = bool(self._mirror_var.get())

        chosen = [None]

        def on_select(params):
            chosen[0] = params

        dlg = SettingsPickerDialog(
            self, image_path, auto_settings, base_kwargs, mirror_enabled,
            on_select=on_select,
            preload_cache=self._picker_cache,
        )
        dlg.wait_window()

        if chosen[0] is not None:
            params = chosen[0]
            self._apply_auto_settings({
                "blur":       params.get("blur",       int(self._blur_var.get())),
                "canny_low":  params.get("canny_low",  int(self._canny_low_var.get())),
                "canny_high": params.get("canny_high", int(self._canny_hi_var.get())),
                "min_area":   params.get("min_area",   float(self._min_area_var.get())),
                "min_length": params.get("min_length", float(self._min_length_var.get())),
            })
            self._smooth_var.set(params.get("smooth", int(self._smooth_var.get())))
            self._thin_var.set(bool(params.get("thin", self._thin_var.get())))
            self._update_history_note(image_path)
            self._status("Settings applied — click Convert & Preview Path.")
        else:
            self._status("Picker cancelled — settings unchanged.")

    def _preload_picker_images(self, images: list, start: int, count: int = 3):
        """Background-preload all 10 picker variants for up to `count` images."""
        if self._picker_preload_executor is not None:
            self._picker_preload_executor.shutdown(wait=False)
        self._picker_preload_executor = ThreadPoolExecutor(max_workers=2)
        base_kwargs    = self._collect_build_kwargs()
        mirror_enabled = bool(self._mirror_var.get())

        for img_path in images[start: start + count]:
            if (str(img_path), 0) in self._picker_cache:
                continue
            self._picker_preload_executor.submit(
                self._preload_one_image, str(img_path), base_kwargs, mirror_enabled,
            )

    def _preload_one_image(self, image_path: str, base_kwargs: dict,
                            mirror_enabled: bool):
        try:
            auto_settings = core.compute_auto_settings(image_path)
        except Exception:
            return
        for i, (blur, mult, smooth, thin, mln, clr, _) in enumerate(_PICKER_PHASE1_VARIANTS):
            cache_key = (image_path, i)
            if cache_key in self._picker_cache:
                continue
            try:
                params = _make_variant_params(auto_settings, base_kwargs, blur, mult, smooth, thin, mln, clr)
                result = core.build_thr_path(image_path=image_path, **params)
                img    = _render_thr_preview_pil(
                    result, size=SettingsPickerDialog.THUMB_SIZE,
                    mirror_enabled=mirror_enabled,
                )
                self._picker_cache[cache_key] = img
            except Exception as exc:
                self._picker_cache[cache_key] = exc

    def _run_batch_picker(self):
        """Batch convert a folder, showing the settings picker for each image."""
        current     = Path(self._image_var.get().strip()) if self._image_var.get().strip() else None
        initial_dir = str(current.parent) if current and current.exists() else str(
            Path.home() / "Pictures" / "Pokemon")
        source_dir  = filedialog.askdirectory(
            title="Select image folder for Batch Pick & Convert",
            initialdir=initial_dir,
        )
        if not source_dir:
            return

        src    = Path(source_dir)
        out_dir = src / "thr Files"
        images  = sorted([p for p in src.iterdir()
                           if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS])
        if not images:
            messagebox.showwarning("No images", f"No images found in:\n{src}")
            return

        out_dir.mkdir(parents=True, exist_ok=True)
        preview_dir = out_dir / "path previews"
        preview_dir.mkdir(parents=True, exist_ok=True)
        mirror_enabled = bool(self._mirror_var.get())
        entry_mode     = self._entry_var.get()

        ok, skipped = 0, 0
        failed: list[str] = []

        for idx, img_path in enumerate(images):
            out_path = out_dir / f"{img_path.stem}.thr"
            if out_path.exists():
                skipped += 1
                continue

            self._image_var.set(str(img_path))
            self._show_original_for_path(str(img_path))
            self._status(f"Batch Pick {idx + 1}/{len(images)}: {img_path.name}")
            self.update_idletasks()

            try:
                auto_settings = core.compute_auto_settings(str(img_path))
            except Exception as exc:
                failed.append(f"{img_path.name}: auto-settings failed: {exc}")
                continue

            base_kwargs = self._collect_build_kwargs()
            chosen = [None]

            def on_select(params, _store=chosen):
                _store[0] = params

            dlg = SettingsPickerDialog(
                self, str(img_path), auto_settings, base_kwargs, mirror_enabled,
                on_select=on_select,
                preload_cache=self._picker_cache,
            )
            dlg.wait_window()

            if chosen[0] is None:
                self._status("Batch Pick cancelled.")
                break

            self._update_history_note(str(img_path))
            build_kwargs = dict(chosen[0])
            try:
                result = self._build_path_result(str(img_path), build_kwargs)
                final  = self._build_final_thr_from_result(result, mirror_enabled, entry_mode)
                comment = (f"Generated by SandArtGUI.py\n"
                           f"Source: {img_path.name}\n"
                           f"Engine: SandArt\n"
                           f"Points: {len(final)}")
                core.write_thr(final, str(out_path), comment=comment)
                navigate  = result.get("navigate")  if isinstance(result, dict) else None
                outline   = result.get("outline")   if isinstance(result, dict) else None
                n_outline = int(result.get("n_outline", 0) or 0) if isinstance(result, dict) else 0
                save_thr_preview_png(
                    final, str(preview_dir / f"{img_path.stem}.png"),
                    navigate=navigate, outline=outline, n_outline=n_outline,
                    mirror_enabled=mirror_enabled,
                )
                ok += 1
            except Exception as exc:
                failed.append(f"{img_path.name}: {exc}")

        summary = (f"Batch Pick complete: {ok} saved, "
                   f"{skipped} skipped, {len(failed)} failed.")
        self._status(summary)
        if failed:
            sample = "\n".join(failed[:10])
            more   = f"\n…and {len(failed) - 10} more" if len(failed) > 10 else ""
            messagebox.showwarning("Batch Pick complete with errors",
                                    f"{summary}\n\nFailures:\n{sample}{more}")
        else:
            messagebox.showinfo("Batch Pick complete", summary)

    def _on_error(self, msg: str, task_id: int | None = None):
        if task_id is not None and not self._is_task_current(task_id):
            return
        self._progress.grid_remove()
        self._set_busy(False, f"Error: {msg}")
        messagebox.showerror("Error", msg)

    def _set_busy(self, busy: bool, status_msg: str = ""):
        self._working = busy
        state = "disabled" if busy else "normal"
        self._preview_btn.config(state=state)
        self._convert_btn.config(state=state)
        self._picker_btn.config(state=state)
        self._batch_btn.config(state=state)
        self._batch_picker_btn.config(state=state)
        self._cancel_btn.config(state="normal" if busy else "disabled")
        if not busy and self._cached_polar is not None:
            self._save_btn.config(state="normal")
            self._save_svg_btn.config(state="normal")
        if not busy:
            self._active_task_kind = None
            self._cancel_requested = False
            self._batch_total = 0
            self._batch_index = 0
            self._batch_name = ""
        if status_msg:
            self._status_var.set(status_msg)
        self.update_idletasks()


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not HAS_PIL:
        print("Note: Pillow not installed. Edge image display disabled; "
              "contour overlay will still work.\n"
              "Install with: pip install Pillow")
    app = SandArtApp()
    app.mainloop()
