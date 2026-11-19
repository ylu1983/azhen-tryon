# 阿蓁の衣舖子｜免費搭配試衣間

Free, browser-only body-aligned outfit preview for the shop. Upload a front-facing full-body photo, choose among 27 looks, mix upper/lower garments, correct body points, and download a marked PNG.

**This is local pose-guided garment warping, not generative AI virtual try-on.** MediaPipe detects shoulders, hips, knees and ankles on-device. Piecewise affine meshes deform garment textures to those regions; local segmentation preserves the customer's face, hair and visible forearms/hands. It does not erase original clothes, reconstruct occluded fabric, reproduce 3D drape or estimate fit. Loose original clothing can show outside the replacement. The UI and exports say this explicitly. No paid provider, API key, account or backend is used.

## Privacy

Customer and custom garment photos are decoded and resized locally in the browser, stripped of EXIF metadata by re-encoding, and held only in page memory. There are no photo uploads, analytics, third-party fonts, browser persistence, service workers or remote inference calls. Network requests only download same-origin catalog, garment metadata, images, runtime and models. All inference assets are bundled; there is no runtime CDN. A CSP restricts connections to the site itself. Clearing the photo clears the photo, masks, body points and garments; refresh/close discards them. Downloaded files remain on the device. Browser HTTP caches may retain public models/catalog assets, never customer photos.

Model/runtime download is approximately 40 MB on first automatic analysis. Use a current Chrome/Edge/Safari with WebAssembly and WebGL support. This is one-shot still-photo processing, not a live camera. Failed detection or unsupported devices open an explicitly manual eight-point correction mode; no external fallback is called. Prefer a single front-facing standing subject, visible ankles, arms away from the torso and fitted original clothes. Crossed legs, profile views and seated poses are not supported.

Inputs accept JPEG, PNG and WebP, up to 10 MB and 20 megapixels, with a minimum 128px short edge. HEIC is rejected with instructions to convert to JPEG. A custom garment image can be added locally; transparent PNG works best because this version does not automatically remove its background.

## Build and run

Python 3.10+ and Pillow generate `docs/` from the committed prepared catalog. Node 22+ runs geometry tests. No npm dependencies are required. The deployed site is plain HTML, CSS and ES modules.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py
python3 -m http.server 8000 --directory docs
```

Open a server rather than `file://` so ES modules/catalog loading work. Asset URLs are relative for GitHub Pages project paths.

```sh
.venv/bin/python -m unittest discover -s tests -v
npm test
```

CI rebuilds the site, validates the 27 looks and transparent garment assets, and rejects stale generated output. GitHub Pages publishes `main` → `/docs`.

## Catalog and cutout quality

The first 27 model photographs and names are copied from [ylu1983/azhen-lookbook](https://ylu1983.github.io/azhen-lookbook/). Traditional Chinese copy, logo and warm ivory/olive palette follow that shop site.

`static/catalog.json` holds names, occasion tags, categories and the `onePiece` flag. Prepared WebP cutouts and `fit.json` store source-model anchors and crop rectangles in original-photo pixel coordinates. `scripts/prepare_garments.py` intersects editorial garment regions with MediaPipe's clothing class, excluding the original model's skin and background. Source hands can leave holes in fabric that cannot be reconstructed; edges are approximate. The ordinary build validates/copies these committed assets instead of rerunning ML, keeping CI reproducible and lightweight.

To intentionally regenerate catalog assets (not needed to run or deploy the site), use Python 3.10–3.12 with system OpenGL/EGL support:

```sh
.venv/bin/pip install -r requirements-authoring.txt
.venv/bin/python scripts/prepare_garments.py
.venv/bin/python scripts/build.py
```

Review all generated cutouts and pose metadata before committing. Editorial percentage regions live in `scripts/build.py`; source pose coordinates must correspond to each source photo. See `THIRD_PARTY.md` for pinned runtime/model provenance and licenses.

For better results, use isolated shop-supplied garment photos with transparent backgrounds. Retain `NN-tops.webp`, `NN-bottoms.webp` or `NN-dress.webp` naming and supply matching crop/anchor metadata; custom uploaded garments use an approximate flat-garment template that may need adjustment. Outfit 2 has no usable lower-body reference; dresses 12, 14 and 22 are whole-piece only.

## Future real AI integration

`static/local-compositor.js` is the rendering boundary, `static/body-fit.js` is pure mesh geometry, and `static/on-device-body.js` is the local ML adapter. None has an upload method. A future remote AI adapter must be a separate explicit opt-in flow with consent, private retention controls and an approved budget. Never add an automatic external fallback or browser-visible secret. This free app never calls a model service.

## Controls

- Complete looks replace all layers; tops and bottoms can be selected independently.
- Clothing automatically refits when body points change. Correct eight points by dragging numbered handles, selecting a point and moving its sliders, or using arrow keys on the canvas.
- Body calibration resets garment adjustments. The face/arm preservation toggle can be disabled when it incorrectly covers a new sleeve; it is unavailable if automatic segmentation failed.
- Select a layer, then drag or adjust its position, width, height, rotation and opacity. Arrow keys move it; Shift accelerates movement.
- Compare the original, reset a layer, clear clothes, replace/remove the photo, or download a watermarked reference.
- A shop model is shown before a personal photo is selected. Demo exports are marked as model demonstrations.
