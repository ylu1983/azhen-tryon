import base64
import io
import os
import threading
import time
import unittest
from unittest.mock import Mock, patch

from PIL import Image

import app as module


def photo(color="white", size=(240, 320)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


PHOTO = photo()
OUTPUT = photo("blue")
SECOND_OUTPUT = photo("green")


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"FASHN_API_KEY": "test-only-not-a-real-key", "DAILY_CREDIT_LIMIT": "20"})
        self.env.start()
        self.app = module.create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()
        self.csrf = self.client.get("/api/config").json["csrf"]

    def tearDown(self):
        extension = self.app.extensions["tryon"]
        extension["stop_cleanup"].set()
        extension["executor"].shutdown(wait=True)
        self.env.stop()

    def submit(self, **overrides):
        data = dict(photo=PHOTO, consent=True, steps=[dict(id=11, category="auto")])
        data.update(overrides)
        return self.client.post("/api/tryons", json=data, headers={"X-CSRF-Token": self.csrf})

    def settled(self, job_id):
        for _ in range(200):
            result = self.client.get("/api/tryons/" + job_id)
            if result.json["status"] in ("completed", "partial", "failed"):
                return result.json
            time.sleep(.005)
        self.fail("worker did not settle")

    def test_demo_never_submits_to_provider(self):
        with patch.dict(os.environ, {"FASHN_API_KEY": ""}), patch.object(module, "generate") as generate:
            self.assertFalse(self.client.get("/api/config").json["enabled"])
            self.assertEqual(self.submit().status_code, 503)
            generate.assert_not_called()

    def test_key_is_never_returned(self):
        result = self.client.get("/api/config")
        self.assertTrue(result.json["enabled"])
        self.assertNotIn("test-only-not-a-real-key", result.text)
        self.assertEqual(result.headers["Cache-Control"], "no-store")

    def test_requires_csrf_and_explicit_consent(self):
        self.assertEqual(self.client.post("/api/tryons", json={}).status_code, 403)
        self.assertEqual(self.submit(consent=False).status_code, 400)
        self.assertEqual(self.submit(consent="true").status_code, 400)

    def test_rejects_unknown_garments_categories_and_mixed_auto(self):
        for steps in ([], [dict(id=999, category="auto")], [dict(id=True, category="auto")],
                      [dict(id=11, category="http://attacker")],
                      [dict(id=11, category=[])],
                      [dict(id=12, category="tops")], [dict(id=2, category="bottoms")],
                      [dict(id=11, category="auto"), dict(id=1, category="bottoms")]):
            with self.subTest(steps=steps):
                self.assertEqual(self.submit(steps=steps).status_code, 400)

    def test_real_pipeline_passes_validated_photo_and_complete_outfit(self):
        with patch.object(module, "generate", return_value=OUTPUT) as generate:
            response = self.submit()
            self.assertEqual(response.status_code, 202)
            self.assertEqual(self.settled(response.json["id"])["output"], OUTPUT)
            args = generate.call_args.args
            self.assertTrue(args[0].startswith("data:image/jpeg;base64,"))
            self.assertEqual(args[1:3], (11, "auto"))

    def test_mixing_is_sequential_and_uses_first_result_as_second_person(self):
        with patch.object(module, "generate", side_effect=[OUTPUT, SECOND_OUTPUT]) as generate:
            response = self.submit(steps=[dict(id=7, category="tops"), dict(id=9, category="bottoms")])
            self.assertEqual(self.settled(response.json["id"])["output"], SECOND_OUTPUT)
            self.assertEqual(generate.call_args_list[0].args[1:3], (7, "tops"))
            self.assertEqual(generate.call_args_list[1].args[:3], (OUTPUT, 9, "bottoms"))

    def test_second_failure_preserves_first_result(self):
        with patch.object(module, "generate", side_effect=[OUTPUT, module.ProviderError("下身失敗")]):
            response = self.submit(steps=[dict(id=7, category="tops"), dict(id=9, category="bottoms")])
            result = self.settled(response.json["id"])
            self.assertEqual(result["status"], "partial")
            self.assertEqual(result["output"], OUTPUT)
            self.assertEqual(result["error"], "下身失敗")

    def test_failure_is_reported_without_fabricated_output(self):
        with patch.object(module, "generate", side_effect=module.ProviderError("請換全身照")):
            response = self.submit()
            result = self.settled(response.json["id"])
            self.assertEqual(result["status"], "failed")
            self.assertFalse(result.get("output"))

    def test_jobs_are_private_and_can_be_removed(self):
        with patch.object(module, "generate", return_value=OUTPUT):
            job_id = self.submit().json["id"]
            self.settled(job_id)
            other = self.app.test_client()
            self.assertEqual(other.get("/api/tryons/" + job_id).status_code, 404)
            self.assertEqual(other.delete("/api/tryons/" + job_id).status_code, 403)
            self.assertEqual(self.client.delete("/api/tryons/" + job_id,
                headers={"X-CSRF-Token": self.csrf}).status_code, 204)
            self.assertEqual(self.client.get("/api/tryons/" + job_id).status_code, 404)

    def test_expired_photos_are_not_retrievable(self):
        with patch.object(module, "generate", return_value=OUTPUT):
            job_id = self.submit().json["id"]
            self.settled(job_id)
            self.app.extensions["tryon"]["jobs"][job_id]["created"] -= module.TTL + 1
            self.assertEqual(self.client.get("/api/tryons/" + job_id).status_code, 404)

    def test_generation_reservation_prevents_budget_overrun(self):
        with patch.dict(os.environ, {"DAILY_CREDIT_LIMIT": "1"}), patch.object(module, "generate", return_value=OUTPUT):
            self.assertEqual(self.submit(steps=[dict(id=7, category="tops"), dict(id=9, category="bottoms")]).status_code, 429)
            response = self.submit()
            self.settled(response.json["id"])
            self.assertEqual(self.submit().status_code, 429)

    def test_duplicate_active_submissions_are_rejected(self):
        release = threading.Event()
        with patch.object(module, "generate", side_effect=lambda *args: (release.wait(2), OUTPUT)[1]):
            try:
                first = self.submit()
                self.assertEqual(first.status_code, 202)
                self.assertEqual(self.submit().status_code, 409)
            finally:
                release.set()
            self.settled(first.json["id"])

    def test_invalid_images_do_not_reach_provider(self):
        with patch.object(module, "generate") as generate:
            for image in ("https://example.com/person.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,aW52YWxpZA==", photo(size=(10,10))):
                with self.subTest(image=image[:35]):
                    self.assertEqual(self.submit(photo=image).status_code, 400)
            generate.assert_not_called()

    def test_catalog_assets_are_complete_and_categories_valid(self):
        self.assertEqual(len(module.CATALOG), 27)
        self.assertEqual(len(module.BY_ID), 27)
        for item in module.CATALOG:
            for size in ("small", "large"):
                self.assertTrue((module.ROOT / f'static/assets/outfit-{item["id"]:02d}-{size}.webp').is_file())
            self.assertIn("auto", item["categories"])


class ImageAndProviderTests(unittest.TestCase):
    def test_strips_metadata_and_normalizes_orientation(self):
        im = Image.new("RGB", (240, 320))
        exif = Image.Exif(); exif[274] = 6; exif[270] = "private location marker"
        buf = io.BytesIO(); im.save(buf, "JPEG", exif=exif)
        clean = module.normalize_image("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode())
        with Image.open(io.BytesIO(base64.b64decode(clean.split(",")[1]))) as output:
            self.assertEqual(output.size, (320, 240))
            self.assertFalse(output.getexif())

    def test_provider_shape_uses_base64_outputs_and_single_sample(self):
        canceled = Mock(); canceled.wait.return_value = False
        with patch.object(module, "provider_call", side_effect=[dict(id="valid-job"), dict(status="completed", output=[OUTPUT])]) as transport:
            output = module.generate(PHOTO, 11, "tops", canceled)
            self.assertTrue(output.startswith("data:image/jpeg;base64,"))
            path, body = transport.call_args_list[0].args
            self.assertEqual(path, "run")
            self.assertEqual(body["model_name"], "tryon-v1.6")
            self.assertEqual(body["inputs"]["category"], "tops")
            self.assertTrue(body["inputs"]["return_base64"])
            self.assertEqual(body["inputs"]["num_samples"], 1)
            self.assertEqual(body["inputs"]["moderation_level"], "conservative")
            self.assertEqual(transport.call_args_list[1].args, ("status/valid-job",))

    def test_unexpected_public_cdn_result_is_rejected(self):
        canceled = Mock(); canceled.wait.return_value = False
        with patch.object(module, "provider_call", side_effect=[dict(id="valid-job"), dict(status="completed", output=["https://cdn.fashn.ai/private.jpg"]) ]):
            with self.assertRaises(module.ProviderError):
                module.generate(PHOTO, 11, "auto", canceled)

    def test_provider_failure_does_not_retry_chargeable_run(self):
        canceled = Mock(); canceled.wait.return_value = False
        with patch.object(module, "provider_call", side_effect=[dict(id="valid-job"), dict(status="failed", error={"name":"PoseError"})]) as transport:
            with self.assertRaises(module.ProviderError):
                module.generate(PHOTO, 11, "auto", canceled)
            self.assertEqual(transport.call_count, 2)


if __name__ == "__main__":
    unittest.main()
