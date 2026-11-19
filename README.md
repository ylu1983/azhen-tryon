# 阿蓁の衣舖子｜線上試衣間

Traditional Chinese, mobile-friendly virtual try-on for 阿蓁の衣舖子. The 27 initial outfit references are copied from [the shop lookbook](https://ylu1983.github.io/azhen-lookbook/). This is a separate application, not a change to the lookbook.

## What works

- Pick a complete outfit or mix a top and bottom from different looks. Dresses are complete-outfit only.
- Select a personal JPEG, PNG or WebP, with local orientation correction, resizing and metadata stripping. Merely selecting a photo does **not** upload it.
- With a configured server key and explicit photo-processing consent, generate a real FASHN `tryon-v1.6` result. Mixing top and bottom runs two sequential generations; a successful first result is retained if the second fails.
- Compare the original with the generated result, download the result, or remove the website's photo/job record.
- Without a key, the app honestly offers only the selection/upload flow. The generate button stays disabled; there is no fake generated result, overlay, or secretly mocked live endpoint.

The clothes in the initial catalog are on AI models, not isolated garment photographs. FASHN receives the reference as `garment_photo_type: model`; the selected `tops` / `bottoms` category tells it which garment to extract. Model quality with these particular references **has not been verified without a paid key**. Replace them with clear single-item photos for best fidelity. AI results are styling references, not size/fit measurements.

## Run locally

Python 3.10 or newer:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open port 8000. The app defaults to demo mode. No Node.js, database account, cloud storage, or API account is needed for the demo.

For real generation, set `FASHN_API_KEY` in the **server environment**, then restart the server. Never put the key in JavaScript, JSON, git, browser local storage or a public hosting build variable.

```sh
COOKIE_SECURE=1 .venv/bin/gunicorn --workers 1 --threads 4 --bind 0.0.0.0:8000 --timeout 60 app:app
```

Use exactly **one worker**: jobs, generation reservations and photo state intentionally live in memory. Background jobs run on a separate two-thread executor; the request thread returns immediately. Never enable Flask debug mode. No photo request/response bodies should be captured by host-level logging or error tracking.

## What the owner needs to enable real try-on

1. Create a [FASHN account](https://app.fashn.ai).
2. At [Billing → FASHN API](https://app.fashn.ai/billing), buy API credits (not the separate web-app subscription). Official on-demand pricing at implementation: US$0.075 per credit, 100-credit / US$7.50 minimum. `tryon-v1.6` uses one credit per successful image; separately mixed upper/lower garments use up to two. Prices can change: [official pricing](https://help.fashn.ai/plans-and-pricing/api-pricing).
3. After purchasing credits, [Developer API → Create new API key](https://app.fashn.ai/api). Provide the key through Devin's secret UI or the production host's secret environment settings, never chat or a commit.
4. For an owner-only trial, an authenticated session preview or Devin App can host the server; no other hosting account is needed. A session preview depends on this session being awake. A Devin App wakes this session on a visit but goes offline when it is archived/ended.
5. For a customer-facing site, deploy this Python service on a persistent HTTPS host such as Render, Fly.io or a VPS. GitHub Pages cannot run this server or protect a provider key. The included Dockerfile supports a normal container host. This repository does not register an account, subscribe to hosting or spend money automatically.

### Server environment

| Name | Purpose |
| --- | --- |
| `FASHN_API_KEY` | Server-only FASHN credential; absent means demo mode. |
| `SESSION_SECRET` | Random stable secret for signed session cookies. Defaults to ephemeral randomness for local trials. Use a host secret in production. |
| `COOKIE_SECURE` | Set to `1` when served through HTTPS. Leave unset for local HTTP. |
| `DAILY_CREDIT_LIMIT` | Conservative reserved-generation cap per running server process, defaults to 20. Counts attempts, not just successful outputs; resets on restart or server-local date rollover. This is **not** an account billing guarantee. |
| `PORT` | Local development server port; defaults to 8000. Container command also reads it. |

Two concurrent jobs globally and one per browser session prevent a long queue. Requests have image-size limits and CSRF protection. For a publicly advertised paid service, add persistent quotas and stronger abuse protection before allowing anonymous traffic; the prototype's process-local cap can reset on host restarts. Do not enable automatic top-ups just for testing.

## Photo privacy

- No analytics, third-party fonts, browser persistence, accounts or photo album. Catalog images are local assets.
- The browser decodes/re-encodes photos before submission; the server validates raster content and removes metadata again. Maximum input: 10 MB / 20 megapixels; images resize to at most 1296 pixels on the long edge.
- Photos only go to this server and FASHN after an explicit consent checkbox and generate action. The API key never reaches the browser.
- FASHN receives base64 data, not public image URLs; `return_base64: true` requests outputs without a public CDN file. See [FASHN data retention](https://docs.fashn.ai/api-overview/data-retention-privacy): inputs deleted after processing with a one-day cleanup backstop; output base64 available for 60 minutes. Request metadata may persist, but base64 image values are replaced in provider request history.
- Website jobs/results are isolated by a signed, HTTP-only, same-site browser session. They stay in server memory for at most approximately 15 minutes (15-second cleanup interval). Clearing photos deletes the job immediately and stops subsequent processing. In-flight provider requests cannot be withdrawn and can still complete or charge; deleting our record does not delete provider records.
- The server never writes photos to disk, emits provider payloads into logs, stores public result URLs, or saves uploads in git. A server restart intentionally discards jobs and results. Downloaded files and browser memory are controlled by the user.

## Checks

```sh
.venv/bin/python -m unittest discover -s tests -v
```

Tests use an injected/mocked provider transport, not the real paid API. They verify real request shape, sequential garment mixing, consent/CSRF gates, ownership isolation, expired/deleted jobs, failed/partial outputs and image validation. The test transport is never enabled in the production server or public UI. Live provider quality and latency remain unverified until an owner-approved API key and paid test are available.

## Catalog maintenance

`static/catalog.json` contains outfit names/copy, tags and the `onePiece` flag. References are `static/assets/outfit-NN-large.webp`; small previews use `outfit-NN-small.webp`. Keep IDs unique. Replace the references with shop-supplied garment photos later; keep the `model` versus `flat-lay` provider configuration consistent with the new photos.

Source brand tokens and logo: `ylu1983/azhen-lookbook/src/style.css` and `docs/assets/shop-logo-badge.png`. This app uses the same warm ivory / olive palette, Traditional Chinese copy and minimum 16px body text, with a responsive showroom layout.
