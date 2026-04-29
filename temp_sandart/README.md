# SandArt Utilities

Convert Pokemon artwork into `.thr` path files for the [Oasis sand table](https://www.sisyphus-industries.com/).

---

## Requirements

- Python 3.10+
- Install dependencies once:

```
pip install opencv-python pillow numpy requests beautifulsoup4
```

---

## Files included

| File                           | Purpose                                                     |
|--------------------------------|-------------------------------------------------------------|
| `SandArtGUI.py`           | Main GUI — preview, convert, and export images to `.thr`   |
| `SandArt.py`              | Core conversion engine (used by the GUI)                    |
| `download_missing_sugimori.py` | Downloads Gen 1 Sugimori artwork from pokemondb.net         |
| `settings_history.json`  | Pre-tuned conversion settings for all 151 Gen 1 Pokemon     |
| `config.json`            | Created automatically on first run — remembers your folder  |

---

## Quick start for a new user

### Step 1 — Download the artwork

Run the downloader to fetch all 151 Gen 1 Sugimori images into `~/Pictures/Pokemon`
(or pass `--dest` to choose a different folder):

```
python download_missing_sugimori.py
```

If `~/Pictures/Pokemon` does not exist you will be prompted to pick a folder via a dialog.
The script skips any images you already have, so it is safe to re-run.

To download a different range (e.g. all 1025 Pokemon):
```
python download_missing_sugimori.py --end 1025
```

### Step 2 — Open the GUI

```
python SandArtGUI.py
```

### Step 3 — Batch convert all images

1. Click **Batch Convert Folder** and select the folder containing your Pokemon images.
2. The GUI will convert every image using the pre-tuned settings from `settings_history.json`.
3. Output files are saved automatically into the folder structure below.
4. When complete, check the path previews — if any look wrong, open that image individually and pick better settings, then save again to overwrite.

---

## Folder structure

```
Pokemon\
├── 001.png
├── 002.png
├── ...
└── thr Files\
    ├── 001.thr
    ├── 002.thr
    └── path previews\
        ├── 001.png
        └── 002.png
```

---

## Single-image workflow

1. Click **Browse…** (or **Next →** to step through images in order).
2. Click **Preview Edges** to see the detected contours.
3. Adjust sliders until the preview looks right.
4. Click **Convert** then **Save .thr**.
   - The save dialog opens in `<image folder>\thr Files\` automatically.
   - A path-preview PNG is saved to `thr Files\path previews\` alongside it.
5. Your settings are saved to `settings_history.json` — next time you batch-convert, this image will use your chosen values automatically.

---

## Settings history

`settings_history.json` ships with manually tuned settings for all 151 Gen 1 Pokemon.
When batch-converting, the GUI uses these settings per image.
Entries with `"chosen_at": null` are defaults (median of all tuned values) and will be overwritten the first time you manually save settings for that Pokemon.

---

## download_missing_sugimori.py options

| Flag        | Default              | Description                                      |
|-------------|----------------------|--------------------------------------------------|
| `--dest`    | `~/Pictures/Pokemon` | Folder to save images into                       |
| `--start`   | `1`                  | First dex number to download                     |
| `--end`     | `151`                | Last dex number to download                      |
| `--delay`   | `0.5`                | Seconds between requests                         |
| `--dry-run` | off                  | Preview what would be downloaded without saving  |
| `--limit`   | `0` (unlimited)      | Max downloads this run                           |
