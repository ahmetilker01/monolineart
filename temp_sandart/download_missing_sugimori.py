"""Download missing Pokemon Sugimori artwork from pokemondb.net.

Default target folder is ~/Pictures/Pokemon.
Existing files are detected by national dex number (e.g. 001.png), regardless of extension.
"""

from __future__ import annotations

import argparse
import io
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://pokemondb.net"
NATIONAL_URL = f"{BASE_URL}/pokedex/national"
VALID_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_DEST = Path.home() / "Pictures" / "Pokemon"


def _prompt_dest_folder() -> Path:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showinfo(
            "Pokemon folder not found",
            f"Default folder not found:\n{DEFAULT_DEST}\n\n"
            "Please select the folder where artwork should be saved.",
        )
        chosen = filedialog.askdirectory(title="Select Pokemon artwork folder")
        root.destroy()
        if chosen:
            return Path(chosen)
    except Exception:
        pass
    # Fallback for headless / no-display environments.
    print(f"Default folder not found: {DEFAULT_DEST}")
    chosen = input("Enter path to destination folder: ").strip()
    if not chosen:
        raise SystemExit("No folder selected. Exiting.")
    return Path(chosen)


def _fetch(session: requests.Session, url: str, timeout: int = 20, retries: int = 3) -> requests.Response:
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < retries:
                time.sleep(0.8 * attempt)
    raise RuntimeError(f"Failed to fetch {url}: {last_exc}")


def _load_national_entries(session: requests.Session) -> list[tuple[int, str]]:
    html = _fetch(session, NATIONAL_URL).text
    soup = BeautifulSoup(html, "html.parser")

    entries: list[tuple[int, str]] = []
    for card in soup.select("span.infocard-lg-data"):
        small = card.select_one("small")
        name_link = card.select_one("a.ent-name")
        if small is None or name_link is None:
            continue

        m = re.search(r"(\d+)", small.get_text(" ", strip=True))
        if not m:
            continue

        number = int(m.group(1))
        href = name_link.get("href", "")
        slug = href.rsplit("/", 1)[-1].strip().lower()
        if not slug:
            continue
        entries.append((number, slug))

    # Keep first occurrence for each dex number.
    dedup: dict[int, str] = {}
    for n, slug in entries:
        dedup.setdefault(n, slug)
    return sorted(dedup.items(), key=lambda x: x[0])


def _find_sugimori_image_url(session: requests.Session, slug: str) -> str:
    page_url = f"{BASE_URL}/artwork/{slug}"
    html = _fetch(session, page_url).text
    soup = BeautifulSoup(html, "html.parser")

    marker = soup.find(string=re.compile(r"Sugimori artwork", re.IGNORECASE))
    if marker is not None:
        node = marker.parent
        # Search nearby first, then broader fallback.
        candidates = []
        if node is not None:
            candidates.extend(node.find_all_next("img", limit=8))
        candidates.extend(soup.select("img"))
        for img in candidates:
            src = img.get("src", "")
            if not src:
                continue
            if "/artwork/" in src or slug in src:
                return urljoin(page_url, src)

    # Last-resort fallback for page layout changes.
    for img in soup.select("img"):
        src = img.get("src", "")
        if not src:
            continue
        if "/artwork/" in src and slug in src:
            return urljoin(page_url, src)

    raise RuntimeError(f"Could not locate Sugimori artwork image on {page_url}")


def _as_png_bytes(raw_bytes: bytes, image_url: str, content_type: str) -> bytes:
    path_ext = Path(urlparse(image_url).path).suffix.lower()
    if path_ext == ".png" or "png" in content_type:
        return raw_bytes

    # Convert non-PNG artwork to PNG so filenames/output format stay consistent.
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required to convert downloaded images to PNG") from exc

    with Image.open(io.BytesIO(raw_bytes)) as img:
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()


def _has_existing_for_number(dest: Path, number: int) -> bool:
    stem = f"{number:03d}"
    return (dest / f"{stem}.png").exists()


def main() -> int:
    parser = argparse.ArgumentParser(description="Download missing Pokemon Sugimori artwork images.")
    parser.add_argument("--dest", type=Path, default=None,
                        help="Destination folder for artwork files (default: ~/Pictures/Pokemon)")
    parser.add_argument("--start", type=int, default=1, help="First national dex number to include")
    parser.add_argument("--end", type=int, default=151, help="Last national dex number to include (default: 151, Gen 1 only)")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be downloaded without writing files")
    parser.add_argument("--limit", type=int, default=0, help="Optional max number of downloads this run")
    args = parser.parse_args()

    if args.dest is None:
        if DEFAULT_DEST.exists():
            args.dest = DEFAULT_DEST
        else:
            args.dest = _prompt_dest_folder()

    args.dest.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; SandArtDownloader/1.0)",
    })

    entries = _load_national_entries(session)
    entries = [(n, slug) for n, slug in entries if args.start <= n <= args.end]

    downloaded = 0
    skipped = 0
    failed = 0

    for number, slug in entries:
        if args.limit and downloaded >= args.limit:
            break

        if _has_existing_for_number(args.dest, number):
            skipped += 1
            continue

        try:
            img_url = _find_sugimori_image_url(session, slug)
            if args.dry_run:
                print(f"[DRY] {number:03d} <- {img_url}")
                downloaded += 1
            else:
                img_resp = _fetch(session, img_url)
                out_bytes = _as_png_bytes(
                    img_resp.content,
                    img_url,
                    img_resp.headers.get("content-type", "").lower(),
                )
                out_path = args.dest / f"{number:03d}.png"
                out_path.write_bytes(out_bytes)
                print(f"[OK ] {out_path.name}")
                downloaded += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[ERR] {number:03d} ({slug}): {exc}")
            failed += 1

        time.sleep(max(0.0, args.delay))

    print("\nDone")
    print(f"Downloaded: {downloaded}")
    print(f"Skipped (already present): {skipped}")
    print(f"Failed: {failed}")
    print(f"Folder: {args.dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

