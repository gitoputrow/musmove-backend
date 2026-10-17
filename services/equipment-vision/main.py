"""Private inference service. Photos stay in memory; Next.js is the public API."""
import asyncio
import base64
import binascii
import hmac
import io
import math
import os
import re
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from model import MODEL_ID, MODEL_REVISION, NEGATIVE_LABELS, SiglipClassifier

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_BODY_BYTES = 4 * 1024 * 1024
MAX_PIXELS = 16 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,79}$")
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if not value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Invalid candidate name")
        return value


class RecognitionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    imageBase64: str = Field(min_length=1, max_length=MAX_BODY_BYTES)
    candidates: list[Candidate] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({candidate.id for candidate in self.candidates}) != len(self.candidates):
            raise ValueError("Duplicate candidate IDs")
        return self


def decode_image(value: str):
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(400, "Invalid image encoding") from None
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image size is outside the limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in ("JPEG", "PNG", "WEBP") or getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(415, "Unsupported image format")
                if image.width * image.height > MAX_PIXELS:
                    raise HTTPException(413, "Image pixel limit exceeded")
                image.load()
                result = ImageOps.exif_transpose(image).convert("RGB")
                result.thumbnail((1024, 1024))
                return result
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(400, "Invalid or oversized image") from None


def recognition_result(candidates, scores):
    if len(scores) != len(candidates) + len(NEGATIVE_LABELS) or any(
        not math.isfinite(score) or not 0 <= score <= 1 for score in scores
    ):
        raise RuntimeError("Invalid model scores")
    ordered = sorted(zip(candidates, scores[:len(candidates)]), key=lambda item: (-item[1], item[0].id))
    # Negative labels are a heuristic rejection gate, not a validated OOD detector.
    unknown = max(scores[len(candidates):]) >= ordered[0][1] or ordered[0][1] < 1e-6
    return {
        "modelId": MODEL_ID, "modelRevision": MODEL_REVISION,
        "status": "unknown" if unknown else "needs_confirmation",
        "candidates": [] if unknown else [
            {"equipmentId": candidate.id, "score": score} for candidate, score in ordered[:3]
        ],
    }


def create_app(classifier=None, token=None):
    supplied_token = token if token is not None else os.environ.get("EQUIPMENT_VISION_TOKEN", "")
    backend = classifier if classifier is not None else SiglipClassifier()

    @asynccontextmanager
    async def lifespan(app):
        if not re.fullmatch(r"[A-Za-z0-9._~-]{32,256}", supplied_token) or supplied_token.startswith("replace-"):
            raise RuntimeError("Set EQUIPMENT_VISION_TOKEN to a random shared secret of at least 32 characters")
        if hasattr(backend, "load"):
            await asyncio.to_thread(backend.load)
        app.state.gate = asyncio.Semaphore(1)
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorize(request):
        if not supplied_token or not hmac.compare_digest(request.headers.get("authorization", "").encode("utf-8"), f"Bearer {supplied_token}".encode("utf-8")):
            raise HTTPException(401, "Authentication required")

    @app.get("/health")
    async def health(request: Request):
        authorize(request)
        return {"status": "ready", "modelId": MODEL_ID, "modelRevision": MODEL_REVISION, "device": "cpu"}

    @app.post("/recognize")
    async def recognize(request: Request):
        authorize(request)
        if request.headers.get("content-type", "").split(";")[0].lower() != "application/json":
            raise HTTPException(415, "JSON required for the private service")
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
            raise HTTPException(413, "Request too large")
        if app.state.gate.locked():
            raise HTTPException(429, "Recognition busy")
        async with app.state.gate:
            chunks, size = [], 0
            try:
                async with asyncio.timeout(15):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_BODY_BYTES:
                            raise HTTPException(413, "Request too large")
                        chunks.append(chunk)
            except TimeoutError:
                raise HTTPException(408, "Upload timed out") from None
            try:
                payload = RecognitionInput.model_validate_json(b"".join(chunks))
            except ValidationError:
                # Never echo validation inputs containing image data to clients/logs.
                raise HTTPException(400, "Invalid recognition input") from None
            image = decode_image(payload.imageBase64)
            try:
                work = asyncio.create_task(asyncio.to_thread(backend.classify, image, payload.candidates))
                try:
                    scores = await asyncio.shield(work)
                except asyncio.CancelledError:
                    # CPU inference is not interruptible. Keep the gate/image alive
                    # until that thread finishes, even if the caller disconnects.
                    await work
                    raise
                return recognition_result(payload.candidates, scores)
            except Exception:
                raise HTTPException(503, "Recognition failed") from None
            finally:
                image.close()

    return app


app = create_app()
