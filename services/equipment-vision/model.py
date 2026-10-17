"""Pinned open-weight SigLIP 2 classifier; no arbitrary code or image URLs."""
import os
from pathlib import Path

MODEL_ID = "google/siglip2-base-patch16-224"
MODEL_REVISION = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"
CACHE_DIR = Path(__file__).resolve().parent / ".cache" / "huggingface"
NEGATIVE_LABELS = (
    "a cat",
    "a dog",
    "a car",
    "a landscape",
    "an empty room",
    "a screenshot of text",
)


class SiglipClassifier:
    def load(self):
        import torch
        from transformers import AutoModel, AutoProcessor

        threads = int(os.environ.get("EQUIPMENT_VISION_THREADS", "4"))
        if not 1 <= threads <= 16:
            raise RuntimeError("EQUIPMENT_VISION_THREADS must be 1–16")
        torch.set_num_threads(threads)
        self.processor = AutoProcessor.from_pretrained(
            MODEL_ID, revision=MODEL_REVISION, cache_dir=CACHE_DIR,
            trust_remote_code=False, backend="pil",
        )
        self.model = AutoModel.from_pretrained(
            MODEL_ID, revision=MODEL_REVISION, cache_dir=CACHE_DIR,
            trust_remote_code=False, use_safetensors=True,
        ).to("cpu").eval()

    def classify(self, image, candidates):
        import torch

        labels = [candidate.name for candidate in candidates] + list(NEGATIVE_LABELS)
        texts = [f"This is a photo of {label}." for label in labels]
        inputs = self.processor(
            text=texts, images=image, padding="max_length", max_length=64,
            truncation=True, return_tensors="pt",
        )
        with torch.inference_mode():
            output = self.model(**inputs)
            # Similarity scores, NOT calibrated probabilities of gym recognition.
            return torch.sigmoid(output.logits_per_image)[0].cpu().tolist()
