# Dune Weaver Pattern Generator

A browser-based spirograph pattern generator for the [Dune Weaver](https://github.com/tuanchris/dune-weaver) sand table. Design intricate theta-rho patterns from layered geometric shapes — circles, polygons, stars, parametric curves, knots, rosettes, even 3D and 4D wireframes — preview them live, animate the drawing path, and save directly to your table's pattern library with a single click.

The whole app is one self-contained HTML file. No build step, no dependencies, no package manager. Drop it in and go.

## Gallery

A few patterns made with this tool, rendered the way Dune Weaver would draw them in sand:

| | |
|:---:|:---:|
| ![Example 1](previews/example1.webp) | ![Example 2](previews/example2.webp) |
| A 12-point star layered 135× with heavy θ drift, scaling slowly inward into a rotating bloom | A 6-fold rosette of overlapping arcs forming nested petals with sharp angular bracketing |
| ![Example 3](previews/example3.webp) | ![Example 4](previews/example4.webp) |
| Dense pinwheel of curved bands sweeping from rim to center — classic spirograph feel | Four interlocking lobes whose moiré crosshatch gives the impression of woven fabric |

---

## Installation

This page is designed to be served from your Dune Weaver controller so that the **Save** button can upload `.thr` files to the table's API.

1. Locate your Dune Weaver installation directory (the one containing `app.py` / the controller code).
2. Inside that directory, find (or create) the `static/` folder.
3. Copy `spirograph.html` into `static/`:

   ```bash
   cp spirograph.html /path/to/dune-weaver/static/spirograph.html
   ```

4. With your Dune Weaver controller running, open the page in any browser:

   ```
   http://<your-dune-weaver-host>/static/spirograph.html
   ```

   Replace `<your-dune-weaver-host>` with the IP address or hostname of the device running the controller (e.g. `http://dune-weaver.local/static/spirograph.html` or `http://192.168.1.42/static/spirograph.html`).

That's it — there's nothing to install or build.

### Where saved patterns go

When you click **Save**, the page `POST`s the generated theta-rho data as a `.thr` file to the Dune Weaver controller's `/upload_theta_rho` endpoint. The controller writes it into the **`custom_patterns/`** directory inside your Dune Weaver installation, where it will appear alongside your other patterns in the main Dune Weaver UI and be ready to play on the table.

---

## Quick start

1. Open `http://<host>/static/spirograph.html`.
2. Pick a **Shape** from the dropdown — e.g. `Pentagon` or `Rose (5)`.
3. Drag the **Iterations** slider up to layer copies of the shape on top of each other.
4. Tweak **Rotation°**, **Scale**, **θ Drift**, and **ρ Drift** until you like the result.
5. Click **Play Preview** to watch the drawing head trace the pattern.
6. Click **Save**, give it a name, and find it in your Dune Weaver pattern list ready to play.

---

## How it works

The generator follows a four-stage pipeline:

1. **Generate a base shape.** A parametric function emits N points lying within the unit circle.
2. **Layer iterations.** It stamps `iterations` copies of that shape, applying a per-iteration scale (`size × scale^i`), rotation (`rotation × i`), and polar drift (`θ Drift × i`, `ρ Drift × i`) to each. Bridge points are inserted between iterations so the path stays continuous.
3. **Convert to polar.** Each `(x, y)` becomes `(theta, rho)`. Theta is *accumulated* across full revolutions (no `2π` wrapping), which is what the Dune Weaver firmware expects.
4. **Save.** The resulting `theta rho` pairs are written to a `.thr` file with 3-decimal precision and uploaded to the controller.

Points whose radius would exceed the table edge are *reflected* back inward (a triangle-wave fold) rather than clipped, so heavy ρ drift produces decorative bouncing patterns instead of flat circles at the rim.

---

## Controls reference

| Control | Range | What it does |
|---|---|---|
| **Shape** | dropdown | Base shape, grouped by category (Circles, Polygons, Quads, Stars, Curves, Rosettes, Knots, Spirals, Misc, 3D). Changing the shape resets all sliders to defaults. |
| **Size** | 0.1 – 1.0 | Initial radius of the first iteration as a fraction of the table radius. |
| **Iterations** | 1 – 200 | How many stacked copies of the base shape to draw. |
| **Rotation°** | -180 – 180 | Degrees of rotation added per iteration. Small values give gentle precession; integer divisors of 360° produce closed rosettes. |
| **Scale** | 0.8 – 1.2 | Per-iteration size multiplier. Values < 1 spiral inward; > 1 spiral outward (the rim fold keeps things on the table). |
| **θ Drift** | -0.5 – 0.5 | Radians of angular shift added per iteration in polar space. |
| **ρ Drift** | -0.1 – 0.1 | Radial shift added per iteration. Combined with the rim fold, produces flowing wave-like distortions. |
| **Points/shape** | 20 – 200 | Sample resolution for each base shape. Higher values give smoother curves and larger output files. |

Each slider has a paired number input so you can dial in exact values when a slider is too coarse.

### Buttons

- **Play Preview** — animates the drawing path with a moving red dot, the same way the table will trace it. Click again to stop.
- **Save** — prompts for a pattern name and uploads `<name>.thr` to the controller. A toast confirms success or shows the error.

---

## Available shapes

The generator ships with 50+ shapes across these categories:

- **Circles** — Circle, Ellipse, Oval, Semicircle
- **Polygons** — Triangle through Dodecagon (3–12 sides)
- **Quads** — Rectangle, Diamond, Parallelogram, Trapezoid, Kite
- **Stars** — 3, 4, 5, 6, 8, and 12-pointed stars
- **Curves** — Cardioid, Limaçon, Lemniscate, Astroid, Deltoid, Nephroid, Epicycloid, Hypocycloid
- **Rosettes** — Rose curves with 3, 4, 5, 6, and 8 petals
- **Knots** — Trefoil, Quatrefoil, Cinquefoil, Figure-8, Infinity, Torus
- **Spirals** — Archimedean, Logarithmic, Golden
- **Misc** — Heart, Cross, Arrow, Teardrop, Gears, Sine Wave, Zigzag
- **3D** — Cube, Tetrahedron, Octahedron, Tesseract (4D hypercube projection)

---

## Tips for interesting patterns

- **Closed rosettes:** set Rotation° to `360 / N` for some integer N (e.g. 12, 15, 24). After N iterations the pattern returns to its starting orientation.
- **Slow precession:** keep Rotation° small (1–5°) and Iterations high (50–200) for delicate spiral shading.
- **Wave fields:** pair small ρ Drift (e.g. 0.01–0.03) with high Iterations and a simple base like Circle or Triangle. The rim fold creates flowing bands.
- **Detail vs file size:** if your `.thr` is too large, drop **Points/shape** before dropping iterations — most shapes look fine at 40–60 points.
- **Don't trust the static preview alone** — Play Preview shows the drawing order, which sometimes reveals long jumps the static view hides.

---

## File format

Saved files are plain text. One `theta rho` pair per line, space-separated, 3 decimal places:

```
0.000 0.500
0.105 0.498
0.209 0.493
...
```

- `theta` is in radians and **accumulates** across full revolutions (it is *not* clamped to `[0, 2π]`).
- `rho` is in `[0, 1]`, where `0` is the table center and `1` is the rim.

This is the standard Dune Weaver `.thr` format, so saved patterns are interchangeable with anything else in your `custom_patterns/` directory.

---

## Troubleshooting

**"Error: Upload failed" when clicking Save.**
The page must be served from your Dune Weaver controller for the upload to work — it `POST`s to a relative `/upload_theta_rho` URL on the same origin. If you opened the file with `file://` or served it from an unrelated static server, the endpoint won't exist. Move the file into the controller's `static/` directory as described in [Installation](#installation).

**The page loads but Save does nothing.**
Check the browser console. The endpoint expects multipart form data on `POST /upload_theta_rho`. If your Dune Weaver version uses a different endpoint, you'll need to update the URL in the Save handler near the bottom of `spirograph.html`.

**Pattern looks great on screen but the table draws something different.**
Use **Play Preview** to inspect the actual drawing order. The preview shows the path the table will follow; the static render only shows the final image.

**Saved pattern doesn't appear in Dune Weaver UI.**
Confirm the file landed in `custom_patterns/` on the controller and that you refreshed the main UI. The filename you typed in the Save prompt becomes `<name>.thr`.

---

## License

See [LICENSE](LICENSE).
