"""Private, in-memory FASHN try-on gateway. Never write customer images to disk."""
import base64
import binascii
import io
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
import warnings
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).parent
CATALOG = json.loads((ROOT / "static/catalog.json").read_text())
BY_ID = {item["id"]: item for item in CATALOG}
Image.MAX_IMAGE_PIXELS = 20_000_000
MAX_BYTES = 10 * 1024 * 1024
TTL = 15 * 60


def normalize_image(value):
    """Validate real raster content, resize it and strip metadata before forwarding."""
    if not isinstance(value, str) or len(value) > MAX_BYTES * 1.4:
        raise ValueError("照片太大，請選擇 10 MB 以內的照片。")
    match = re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)", value)
    if not match:
        raise ValueError("請使用 JPG、PNG 或 WebP 照片。")
    try:
        raw = base64.b64decode(match[1], validate=True)
        if len(raw) > MAX_BYTES:
            raise ValueError("照片太大，請選擇 10 MB 以內的照片。")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("不支援這種照片格式。")
                if min(image.size) < 128:
                    raise ValueError("照片太小，短邊至少需要 128 像素。")
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((1296, 1296))
                result = io.BytesIO()
                image.save(result, "JPEG", quality=92)
    except (UnidentifiedImageError, OSError, binascii.Error, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:
        raise ValueError("無法讀取這張照片，請換一張 JPG、PNG 或 WebP。") from exc
    return "data:image/jpeg;base64," + base64.b64encode(result.getvalue()).decode()


class ProviderError(Exception):
    pass


def provider_call(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        "https://api.fashn.ai/v1/" + path, data=data,
        headers={"Authorization": "Bearer " + os.environ["FASHN_API_KEY"],
                 "Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read(20 * 1024 * 1024 + 1)
            if len(raw) > 20 * 1024 * 1024:
                raise ProviderError("試穿結果太大，請稍後再試。")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise ProviderError("AI 服務尚未完成設定，請聯絡店家。") from None
        if exc.code in (402, 429):
            raise ProviderError("AI 服務額度或使用量已達上限，請稍後再試。") from None
        raise ProviderError("AI 服務暫時無法處理，請稍後再試。") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise ProviderError("AI 服務連線逾時或回應異常，請稍後再試；請勿連續重送。") from None


def generate(person, garment, category, canceled):
    source = ROOT / "static/assets" / f"outfit-{garment:02d}-large.webp"
    garment_data = "data:image/webp;base64," + base64.b64encode(source.read_bytes()).decode()
    prediction = provider_call("run", {"model_name": "tryon-v1.6", "inputs": {
        "model_image": person, "garment_image": garment_data, "category": category,
        "garment_photo_type": "model", "mode": "balanced", "num_samples": 1,
        "output_format": "jpeg", "return_base64": True, "moderation_level": "conservative",
    }})
    prediction_id = prediction.get("id")
    if prediction.get("error") or not isinstance(prediction_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", prediction_id):
        raise ProviderError("AI 服務未能開始試穿，請稍後再試。")
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        if canceled.wait(2):
            raise ProviderError("已移除本次試穿。")
        status = provider_call("status/" + prediction_id)
        if status.get("status") == "completed":
            try:
                return normalize_image(status["output"][0])
            except (KeyError, IndexError, TypeError, ValueError):
                raise ProviderError("AI 回傳的照片無法讀取，請聯絡店家。") from None
        if status.get("status") == "failed" or status.get("error"):
            raise ProviderError("這次試穿未成功，請換正面、光線清楚的全身照。")
    raise ProviderError("AI 試穿等候時間過長，請稍後再試；原請求仍可能完成並產生費用。")


def create_app():
    app = Flask(__name__)
    app.config.update(SECRET_KEY=os.environ.get("SESSION_SECRET") or secrets.token_hex(32),
                      MAX_CONTENT_LENGTH=15 * 1024 * 1024, SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE="Strict", SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE") == "1")
    jobs, lock = {}, threading.RLock()
    executor = ThreadPoolExecutor(max_workers=2)
    budget = {"date": date.today(), "used": 0}
    stop_cleanup = threading.Event()
    app.extensions["tryon"] = {"jobs": jobs, "budget": budget, "executor": executor, "stop_cleanup": stop_cleanup}

    def clean():
        now = time.monotonic()
        for key, job in list(jobs.items()):
            if now - job["created"] > TTL:
                job["cancel"].set()
                del jobs[key]

    def worker(job_id, person, steps):
        result = None
        with lock:
            job = jobs.get(job_id)
        if job is None:
            return
        try:
            for index, step in enumerate(steps):
                if job["cancel"].is_set():
                    return
                with lock:
                    job.update(status="processing", step=index + 1)
                result = generate(result or person, step["id"], step["category"], job["cancel"])
            with lock:
                if not job["cancel"].is_set():
                    job.update(status="completed", output=result)
        except ProviderError as exc:
            with lock:
                if not job["cancel"].is_set():
                    job.update(status="partial" if result else "failed", error=str(exc), output=result)
        except Exception:
            # Deliberately do not log exceptions: provider payloads may include photos.
            with lock:
                job.update(status="failed", error="試穿暫時無法完成，請稍後再試。")
        finally:
            person = result = None

    def expire_jobs():
        while not stop_cleanup.wait(15):
            with lock:
                clean()

    threading.Thread(target=expire_jobs, daemon=True, name="photo-expiry").start()

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = ("default-src 'self'; img-src 'self' data: blob:; "
            "script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
        return response

    @app.before_request
    def protect():
        if request.path.startswith("/api/"):
            session.setdefault("owner", secrets.token_urlsafe(24))
            session.setdefault("csrf", secrets.token_urlsafe(24))
            if request.method in {"POST", "DELETE"} and not secrets.compare_digest(
                    request.headers.get("X-CSRF-Token", ""), session["csrf"]):
                return jsonify(error="頁面驗證已過期，請重新整理。"), 403

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/config")
    def config():
        return jsonify(enabled=bool(os.environ.get("FASHN_API_KEY")), csrf=session["csrf"],
                       provider="FASHN", model="tryon-v1.6")

    @app.post("/api/tryons")
    def start():
        if not os.environ.get("FASHN_API_KEY"):
            return jsonify(error="目前是選衣示範，AI 試穿尚未開放；照片不會送出。"), 503
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or body.get("consent") is not True:
            return jsonify(error="請先同意將照片交由 FASHN 進行本次試穿。"), 400
        steps = body.get("steps")
        if not isinstance(steps, list) or not 1 <= len(steps) <= 2:
            return jsonify(error="請選擇一套穿搭或上、下身單品。"), 400
        categories = []
        for step in steps:
            if (not isinstance(step, dict) or type(step.get("id")) is not int
                    or step["id"] not in BY_ID or not isinstance(step.get("category"), str)
                    or step["category"] not in {"auto", "tops", "bottoms"}):
                return jsonify(error="選取的衣服無效，請重新選擇。"), 400
            categories.append(step["category"])
            if step["category"] not in BY_ID[step["id"]]["categories"]:
                return jsonify(error="這張參考照不支援選取的部位，請重新選擇。"), 400
        if len(steps) == 2 and categories != ["tops", "bottoms"]:
            return jsonify(error="混搭請依序選擇上身與下身。"), 400
        try:
            person = normalize_image(body.get("photo"))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        with lock:
            clean()
            if any(j["owner"] == session["owner"] and j["status"] in {"queued", "processing"} for j in jobs.values()):
                return jsonify(error="上一張還在試穿中，請先等候。"), 409
            if sum(j["status"] in {"queued", "processing"} for j in jobs.values()) >= 2:
                return jsonify(error="試衣間目前客滿，請稍後再試。"), 429
            if budget["date"] != date.today():
                budget.update(date=date.today(), used=0)
            if budget["used"] + len(steps) > int(os.environ.get("DAILY_CREDIT_LIMIT", "20")):
                return jsonify(error="今日 AI 試穿額度已用完，歡迎私訊店家。"), 429
            # Reserve before submission; ambiguous upstream timeouts must not cause automatic retries.
            budget["used"] += len(steps)
            job_id = secrets.token_urlsafe(24)
            jobs[job_id] = dict(owner=session["owner"], created=time.monotonic(), status="queued",
                                step=0, total=len(steps), cancel=threading.Event())
            executor.submit(worker, job_id, person, steps)
        return jsonify(id=job_id), 202

    @app.route("/api/tryons/<job_id>", methods=["GET", "DELETE"])
    def result(job_id):
        with lock:
            clean()
            job = jobs.get(job_id)
            if job is None or job["owner"] != session["owner"]:
                return jsonify(error="試穿紀錄已移除或已過期，請重新試穿。"), 404
            if request.method == "DELETE":
                job["cancel"].set()
                del jobs[job_id]
                return "", 204
            return jsonify({key: job[key] for key in ("status", "step", "total", "output", "error") if key in job})

    @app.errorhandler(413)
    def too_large(_):
        return jsonify(error="照片太大，請選擇 10 MB 以內的照片。"), 413

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)
