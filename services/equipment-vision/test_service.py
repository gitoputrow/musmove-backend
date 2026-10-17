import base64
import io
import math
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient
from PIL import Image

from main import Candidate, MAX_BODY_BYTES, create_app, recognition_result
from model import NEGATIVE_LABELS

TOKEN = "test-vision-secret-012345678901234567890"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def payload():
    image = Image.new("RGB", (8, 8), "white")
    data = io.BytesIO()
    image.save(data, format="JPEG")
    image.close()
    return {"imageBase64": base64.b64encode(data.getvalue()).decode(), "candidates": [{"id": "dumbbell", "name": "Dumbbell"}]}


class FakeClassifier:
    def classify(self, image, candidates):
        assert image.mode == "RGB"
        return [0.8] * len(candidates) + [0.1] * len(NEGATIVE_LABELS)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.context = TestClient(create_app(FakeClassifier(), TOKEN))
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)

    def test_auth_health_and_private_surface(self):
        self.assertEqual(self.client.get("/health").status_code, 401)
        self.assertEqual(self.client.get("/health", headers=HEADERS).json()["device"], "cpu")
        self.assertEqual(self.client.get("/docs").status_code, 404)
        self.assertEqual(self.client.post("/recognize", json=payload()).status_code, 401)

    def test_success_requires_confirmation(self):
        response = self.client.post("/recognize", headers=HEADERS, json=payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "needs_confirmation")
        self.assertEqual(response.json()["candidates"][0]["equipmentId"], "dumbbell")

    def test_invalid_schema_and_encoding_do_not_echo_photo(self):
        for value in [
            {**payload(), "extra": "secret"},
            {**payload(), "imageBase64": "private-invalid-photo"},
            {**payload(), "candidates": []},
            {**payload(), "candidates": [{"id": "../bad", "name": "bad"}]},
            {**payload(), "candidates": payload()["candidates"] * 2},
        ]:
            response = self.client.post("/recognize", headers=HEADERS, json=value)
            self.assertEqual(response.status_code, 400)
            self.assertNotIn("private-invalid-photo", response.text)
        self.assertEqual(self.client.post("/recognize", headers=HEADERS, content="not json").status_code, 415)

    def test_invalid_images_and_declared_size(self):
        for value in [b"not an image", b"<svg/>"]:
            response = self.client.post("/recognize", headers=HEADERS, json={**payload(), "imageBase64": base64.b64encode(value).decode()})
            self.assertEqual(response.status_code, 400)
        response = self.client.post("/recognize", headers={**HEADERS, "Content-Length": str(MAX_BODY_BYTES + 1)}, json=payload())
        self.assertEqual(response.status_code, 413)

    def test_negative_gate_and_invalid_scores(self):
        candidates = [Candidate(id="dumbbell", name="Dumbbell")]
        self.assertEqual(recognition_result(candidates, [0.2] + [0.5] * len(NEGATIVE_LABELS))["status"], "unknown")
        size = len(candidates) + len(NEGATIVE_LABELS)
        for scores in [[math.nan] * size, [0.2], [2] * size]:
            with self.assertRaises(RuntimeError):
                recognition_result(candidates, scores)

    def test_concurrency_returns_busy(self):
        entered, release = Event(), Event()

        class SlowClassifier(FakeClassifier):
            def classify(self, image, candidates):
                entered.set()
                release.wait(3)
                return super().classify(image, candidates)

        with TestClient(create_app(SlowClassifier(), TOKEN)) as client, ThreadPoolExecutor() as executor:
            first = executor.submit(client.post, "/recognize", headers=HEADERS, json=payload())
            try:
                self.assertTrue(entered.wait(2))
                self.assertEqual(client.post("/recognize", headers=HEADERS, json=payload()).status_code, 429)
            finally:
                release.set()
            self.assertEqual(first.result().status_code, 200)

    def test_missing_token_fails_startup(self):
        with self.assertRaises(RuntimeError):
            with TestClient(create_app(FakeClassifier(), "")):
                pass


if __name__ == "__main__":
    unittest.main()
