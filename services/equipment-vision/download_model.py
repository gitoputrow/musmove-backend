from huggingface_hub import snapshot_download
from model import CACHE_DIR, MODEL_ID, MODEL_REVISION

if __name__ == "__main__":
    snapshot_download(
        MODEL_ID, revision=MODEL_REVISION, cache_dir=CACHE_DIR,
        allow_patterns=["*.json", "*.model", "model.safetensors"],
    )
    print(f"Pinned SigLIP 2 model downloaded: {MODEL_ID}@{MODEL_REVISION}")
