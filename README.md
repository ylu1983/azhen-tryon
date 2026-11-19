# 阿蓁の衣舖子｜免費搭配試衣間

Free, browser-only outfit collage for the shop. Place a personal photo on the canvas, choose among 27 shop looks, mix upper/lower garments, adjust each layer, and download a watermarked PNG.

**This is manual clothing overlay, not AI virtual try-on.** It cannot remove the original clothes, fit a garment to body pose, reproduce fabric drape or estimate sizing. The UI and exports say this explicitly. No paid provider, API key, account, database, cloud storage or backend is used.

## Privacy

Customer and custom garment photos are decoded and resized locally in the browser, stripped of EXIF metadata by re-encoding, and held only in page memory. There are no photo uploads, analytics, third-party fonts, browser persistence, service workers or remote inference calls. The only JavaScript fetch loads the site's own catalog JSON. Clearing the photo also clears garment layers; refresh/close discards the session. Files the user downloads remain on their device.

Inputs accept JPEG, PNG and WebP, up to 10 MB and 20 megapixels, with a minimum 128px short edge. HEIC is rejected with instructions to convert to JPEG. A custom garment image can be added locally; transparent PNG works best because this version does not automatically remove its background.

## Build and run

Python 3.10+ and Pillow are only needed to prepare catalog cutouts and generate `docs/`. The deployed site is plain HTML, CSS and ES modules.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py
python3 -m http.server 8000 --directory docs
```

Open a server rather than `file://` so ES modules/catalog loading work. Asset URLs are relative for GitHub Pages project paths.

```sh
.venv/bin/python -m unittest discover -s tests -v
```

CI rebuilds the site, validates the 27 looks and transparent garment assets, and rejects stale generated output. GitHub Pages publishes `main` → `/docs`.

## Catalog and cutout quality

The first 27 model photographs and names are copied from [ylu1983/azhen-lookbook](https://ylu1983.github.io/azhen-lookbook/). Traditional Chinese copy, logo and warm ivory/olive palette follow that shop site.

`static/catalog.json` holds names, occasion tags, categories and the `onePiece` flag. `scripts/build.py` contains editorial percentage-coordinate garment masks and creates transparent WebP assets in `static/garments/`. These approximate silhouettes are cut from model photographs; some edges/background or original-model body parts may remain. The UI discloses that limitation. They are not AI-segmented product photos.

For better results, replace references with clear, isolated shop-supplied garment photos with transparent backgrounds. Retain the `NN-tops.webp`, `NN-bottoms.webp` or `NN-dress.webp` naming, and adjust the build step so it does not overwrite replacements. Outfit 2 has no usable lower-body reference; dresses 12, 14 and 22 are whole-piece only.

## Future real AI integration

`static/local-compositor.js` is the rendering adapter boundary. The current adapter only draws local images and has no upload method. A future AI adapter must be a separate, explicit opt-in flow with consent, a server-side proxy and secret, private retention controls, and an approved budget. Do not add an automatic external fallback or browser-visible key. This free app never calls FASHN or any other model service.

## Controls

- Complete looks replace all layers; tops and bottoms can be selected independently.
- Select a layer, then drag or adjust its position, width, height, rotation and opacity. Arrow keys move it; Shift accelerates movement.
- Compare the original, reset a layer, clear clothes, replace/remove the photo, or download a watermarked reference.
- A shop model is shown before a personal photo is selected. Demo exports are marked as model demonstrations.
