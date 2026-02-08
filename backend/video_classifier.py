"""
NightWalk - Video Crime Classification Module
Uses the OPear/videomae-large-finetuned-UCF-Crime model to classify
video evidence submitted by citizens.

Model: VideoMAE (Video Masked Autoencoder) fine-tuned on the UCF Crime dataset
Labels: 14 classes including Abuse, Arson, Assault, Burglary, Fighting, Robbery, etc.
Accuracy: 92.96% on the UCF Crime validation split
"""
import os
import logging
from typing import Optional

import torch
import cv2
import numpy as np

logger = logging.getLogger("nightwalk.classifier")

# ============================================================================
# Crime Class Mapping (from model card)
# ============================================================================

CLASS_MAPPING: dict[str, int] = {
    "Abuse": 0,
    "Arrest": 1,
    "Arson": 2,
    "Assault": 3,
    "Burglary": 4,
    "Explosion": 5,
    "Fighting": 6,
    "Normal Videos": 7,
    "Road Accidents": 8,
    "Robbery": 9,
    "Shooting": 10,
    "Shoplifting": 11,
    "Stealing": 12,
    "Vandalism": 13,
}

REVERSE_MAPPING: dict[int, str] = {v: k for k, v in CLASS_MAPPING.items()}

# Map model labels → our CrimeType enum values (for DB storage)
MODEL_LABEL_TO_CRIME_TYPE: dict[str, str] = {
    "Abuse": "abuse",
    "Arrest": "arrest",
    "Arson": "arson",
    "Assault": "assault",
    "Burglary": "burglary",
    "Explosion": "explosion",
    "Fighting": "fighting",
    "Normal Videos": "normal",
    "Road Accidents": "road_accidents",
    "Robbery": "robbery",
    "Shooting": "shooting",
    "Shoplifting": "shoplifting",
    "Stealing": "stealing",
    "Vandalism": "vandalism",
}

# ============================================================================
# Singleton Model Loader
# ============================================================================

_model = None
_device = None


def get_device() -> torch.device:
    """Determine the best available device."""
    global _device
    if _device is None:
        if torch.cuda.is_available():
            _device = torch.device("cuda")
            logger.info("🎮 Using CUDA GPU for VideoMAE inference")
        else:
            _device = torch.device("cpu")
            logger.info("💻 Using CPU for VideoMAE inference")
    return _device


def get_model():
    """
    Lazy-load the VideoMAE model. First call downloads the model (~1.3GB);
    subsequent calls return the cached instance.
    """
    global _model
    if _model is None:
        from transformers import VideoMAEForVideoClassification
        from config import get_settings

        settings = get_settings()
        model_name = settings.videomae_model_name
        device = get_device()

        logger.info(f"📥 Loading VideoMAE model: {model_name}")
        _model = VideoMAEForVideoClassification.from_pretrained(
            model_name,
            label2id=CLASS_MAPPING,
            id2label=REVERSE_MAPPING,
            ignore_mismatched_sizes=True,
        ).to(device)
        _model.eval()
        logger.info("✅ VideoMAE model loaded successfully")
    return _model


# ============================================================================
# Video Processing
# ============================================================================

def load_video_frames(
    video_path: str,
    num_frames: int = 16,
    size: tuple[int, int] = (224, 224),
) -> Optional[torch.Tensor]:
    """
    Load and preprocess video frames for VideoMAE inference.

    Samples `num_frames` evenly-spaced frames from the video, resizes to
    224×224, and normalises pixel values to [0, 1].

    Args:
        video_path: Path to the video file on disk
        num_frames: Number of frames to sample (model expects 16)
        size: Target frame resolution (model expects 224x224)

    Returns:
        Tensor of shape [num_frames, 3, H, W] or None on failure
    """
    if not os.path.exists(video_path):
        logger.error(f"Video file not found: {video_path}")
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"Failed to open video: {video_path}")
        return None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        logger.error(f"Video has no frames: {video_path}")
        cap.release()
        return None

    # Sample evenly-spaced frame indices
    frame_indices = set(np.linspace(0, total_frames - 1, num_frames, dtype=int).tolist())
    frames: list[np.ndarray] = []

    for i in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            break
        if i in frame_indices:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = cv2.resize(frame, size)
            frames.append(frame)

    cap.release()

    if len(frames) == 0:
        logger.error(f"No frames could be read from: {video_path}")
        return None

    # Pad if we got fewer frames than requested
    while len(frames) < num_frames:
        frames.append(frames[-1])

    # Trim to exact count
    frames = frames[:num_frames]

    # Stack → [num_frames, H, W, 3] → permute → [num_frames, 3, H, W] and normalise
    frame_array = np.stack(frames, axis=0)
    tensor = torch.tensor(frame_array, dtype=torch.float32).permute(0, 3, 1, 2) / 255.0

    return tensor


# ============================================================================
# Classification API
# ============================================================================

def classify_video(video_path: str) -> dict:
    """
    Classify a video file using the VideoMAE UCF-Crime model.

    Args:
        video_path: Path to the video file on disk

    Returns:
        Dictionary with:
            - label: Human-readable predicted crime type (e.g. "Robbery")
            - crime_type: Normalised crime type for DB (e.g. "robbery")
            - confidence: Float 0-1 for top prediction
            - is_crime: Boolean — True if not classified as "Normal Videos"
            - all_probabilities: Dict mapping every label to its probability
            - top_3: List of (label, probability) tuples for the 3 highest

    Raises:
        RuntimeError: If video cannot be processed
    """
    frames = load_video_frames(video_path)
    if frames is None:
        raise RuntimeError(f"Failed to load video frames from: {video_path}")

    model = get_model()
    device = get_device()

    # Model expects [batch, num_frames, channels, H, W]
    video_tensor = frames.unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(video_tensor)
        probs = torch.nn.functional.softmax(outputs.logits, dim=-1)

    probs_cpu = probs[0].cpu()
    predicted_idx = torch.argmax(probs_cpu).item()
    confidence = probs_cpu[predicted_idx].item()
    predicted_label = REVERSE_MAPPING[predicted_idx]

    # Build full probability map
    all_probs = {
        REVERSE_MAPPING[i]: round(probs_cpu[i].item(), 4)
        for i in range(len(REVERSE_MAPPING))
    }

    # Top-3 predictions
    top_indices = torch.topk(probs_cpu, k=min(3, len(REVERSE_MAPPING))).indices.tolist()
    top_3 = [(REVERSE_MAPPING[i], round(probs_cpu[i].item(), 4)) for i in top_indices]

    result = {
        "label": predicted_label,
        "crime_type": MODEL_LABEL_TO_CRIME_TYPE.get(predicted_label, "unknown"),
        "confidence": round(confidence, 4),
        "is_crime": predicted_label != "Normal Videos",
        "all_probabilities": all_probs,
        "top_3": top_3,
    }

    logger.info(
        f"🔍 Classification result: {predicted_label} "
        f"({confidence:.1%}) | Crime: {result['is_crime']}"
    )

    return result
