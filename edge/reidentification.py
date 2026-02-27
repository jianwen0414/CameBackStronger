"""
edge/reidentification.py
Person Re-Identification using torchvision ResNet50 (fast-reid backend).

Replaces torchreid/OSNet with a pretrained ResNet50 backbone (ImageNet weights),
FC layer swapped for Identity so the output is a 2048-dim feature vector.
No Cython compilation required — works with Python 3.13+.

Install:
    uv sync --extra reid
    # or: pip install torch torchvision
"""

from __future__ import annotations

import numpy as np
import cv2
from collections import defaultdict

try:
    import torch
    import torchvision.models as tv_models
    import torchvision.transforms as T
    REID_AVAILABLE = True
except ImportError:
    REID_AVAILABLE = False


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FEATURE_HISTORY_LEN = 10   # Rolling window of feature vectors per track
REID_INPUT_W        = 128  # Width fed into ResNet (portrait crop)
REID_INPUT_H        = 256  # Height fed into ResNet (portrait crop)
FEATURE_DIM         = 2048 # ResNet50 penultimate-layer output dim


# ---------------------------------------------------------------------------
# PersonReID
# ---------------------------------------------------------------------------
class PersonReID:
    """
    In-memory person re-identification across multiple cameras.

    Backend: torchvision ResNet50 pretrained on ImageNet, FC → Identity.
    Features are 2048-dim, L2-normalised before storage.

    Usage::

        reid = PersonReID(device='cpu')
        # Per frame, after getting YOLO detections:
        crop = frame[y1:y2, x1:x2]
        feats = reid.extract_features(crop)
        reid.update_features(camera_id=1, track_id=42, features=feats)

        # Periodically (e.g. every 10 frames):
        matches = reid.find_cross_camera_matches(threshold=0.70)
        reid.assign_global_ids(matches)

        # Visualisation:
        color = reid.get_color_for_track(camera_id=1, track_id=42)
        global_id = reid.get_global_id(camera_id=1, track_id=42)
    """

    def __init__(self, model_name: str = "resnet50", device: str = "cpu") -> None:
        if not REID_AVAILABLE:
            raise ImportError(
                "torch and torchvision are not installed. "
                "Run: uv sync --extra reid"
            )

        self.device = device

        print(f"[ReID] Loading ResNet50 backbone on {device} ...")
        backbone = tv_models.resnet50(weights=tv_models.ResNet50_Weights.IMAGENET1K_V2)
        backbone.fc = torch.nn.Identity()   # strip classifier → 2048-dim output
        self.model = backbone.to(device)
        self.model.eval()

        # Standard ImageNet normalisation (RGB)
        self._transform = T.Compose([
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406],
                        std =[0.229, 0.224, 0.225]),
        ])
        print(f"[ReID] ResNet50 loaded. Feature dim: {FEATURE_DIM}.")

        # {camera_id: {track_id: [feature_vector, ...]}}
        self.camera_features: dict[int, dict[int, list[np.ndarray]]] = (
            defaultdict(lambda: defaultdict(list))
        )

        # {(camera_id, track_id): global_person_id}
        self.global_person_ids: dict[tuple[int, int], int] = {}
        self._next_global_id: int = 1

        # Only weapon-holder gallery entries are eligible for re-identification
        self._weapon_holder_keys: set[tuple[int, int]] = set()

        # Colour palette — seeded so colours are deterministic
        self._colours = self._generate_colours(50)

    # ------------------------------------------------------------------
    # Colour helpers
    # ------------------------------------------------------------------
    def _generate_colours(self, n: int) -> list[tuple[int, int, int]]:
        """Generate n visually distinct BGR colours via HSV."""
        np.random.seed(42)
        colours = []
        for i in range(n):
            hue = int(180 * i / n)
            bgr = cv2.cvtColor(np.uint8([[[hue, 255, 200]]]), cv2.COLOR_HSV2BGR)[0][0]
            colours.append(tuple(map(int, bgr)))
        return colours

    # ------------------------------------------------------------------
    # Feature extraction
    # ------------------------------------------------------------------
    def _preprocess_crop(self, crop: np.ndarray) -> torch.Tensor | None:
        """Resize BGR crop → RGB → normalised tensor (1, 3, H, W)."""
        if crop is None or crop.size == 0:
            return None
        if crop.shape[0] < 10 or crop.shape[1] < 10:
            return None
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        rgb = cv2.resize(rgb, (REID_INPUT_W, REID_INPUT_H))
        tensor = self._transform(rgb).unsqueeze(0)  # (1, 3, H, W)
        return tensor.to(self.device)

    def extract_features(self, crop: np.ndarray) -> np.ndarray | None:
        """
        Extract a L2-normalised 2048-dim feature vector from a person crop.
        Returns None if the crop is invalid.
        """
        tensor = self._preprocess_crop(crop)
        if tensor is None:
            return None

        with torch.no_grad():
            feats = self.model(tensor)          # (1, 2048)

        feats = feats.cpu().numpy()[0]          # (2048,)
        norm = np.linalg.norm(feats)
        if norm == 0:
            return None
        return feats / norm

    # ------------------------------------------------------------------
    # Feature storage
    # ------------------------------------------------------------------
    def update_features(
        self,
        camera_id: int,
        track_id: int,
        features: np.ndarray | None,
        max_history: int = FEATURE_HISTORY_LEN,
    ) -> None:
        """Append new features for a track, capping at max_history."""
        if features is None:
            return
        history = self.camera_features[camera_id][track_id]
        history.append(features)
        if len(history) > max_history:
            history.pop(0)

    def get_averaged_features(
        self, camera_id: int, track_id: int
    ) -> np.ndarray | None:
        """Return the L2-normalised mean of all stored features for a track."""
        history = self.camera_features.get(camera_id, {}).get(track_id)
        if not history:
            return None
        avg = np.mean(history, axis=0)
        norm = np.linalg.norm(avg)
        return avg / norm if norm > 0 else None

    def clear_track(self, camera_id: int, track_id: int) -> None:
        """Remove feature history for a track (call when track is lost)."""
        self.camera_features[camera_id].pop(track_id, None)
        self.global_person_ids.pop((camera_id, track_id), None)
        self._weapon_holder_keys.discard((camera_id, track_id))

    def mark_weapon_holder(self, camera_id: int, track_id: int) -> None:
        """Mark a track as a confirmed weapon holder so it appears in the
        gallery searched by _find_gallery_match."""
        self._weapon_holder_keys.add((camera_id, track_id))

    # ------------------------------------------------------------------
    # Matching
    # ------------------------------------------------------------------
    @staticmethod
    def cosine_similarity(feat1: np.ndarray, feat2: np.ndarray) -> float:
        """Cosine similarity in [−1, 1]. Assumes L2-normalised inputs."""
        return float(np.dot(feat1, feat2))

    def find_cross_camera_matches(
        self, threshold: float = 0.70
    ) -> dict[tuple[int, int], dict]:
        """
        Compare feature galleries across every camera pair.

        Returns a dict::
            {(cam_id, track_id): {"camera": cam_id2, "track": track_id2, "similarity": float}}

        Only the best match above `threshold` is kept per track.
        Matches are stored bidirectionally.
        """
        matches: dict[tuple[int, int], dict] = {}
        camera_ids = list(self.camera_features.keys())

        if len(camera_ids) < 2:
            return matches

        for i, cam1 in enumerate(camera_ids):
            for cam2 in camera_ids[i + 1:]:
                for track1 in self.camera_features[cam1]:
                    feat1 = self.get_averaged_features(cam1, track1)
                    if feat1 is None:
                        continue

                    best_track2 = None
                    best_sim = threshold  # must beat this

                    for track2 in self.camera_features[cam2]:
                        feat2 = self.get_averaged_features(cam2, track2)
                        if feat2 is None:
                            continue
                        sim = self.cosine_similarity(feat1, feat2)
                        if sim > best_sim:
                            best_sim = sim
                            best_track2 = track2

                    if best_track2 is not None:
                        matches[(cam1, track1)] = {
                            "camera": cam2,
                            "track": best_track2,
                            "similarity": best_sim,
                        }
                        matches[(cam2, best_track2)] = {
                            "camera": cam1,
                            "track": track1,
                            "similarity": best_sim,
                        }

        return matches

    # ------------------------------------------------------------------
    # Global ID assignment
    # ------------------------------------------------------------------
    def _find_gallery_match(
        self,
        camera_id: int,
        track_id: int,
        threshold: float = 0.85,
        min_history: int = 3,
        active_track_ids: set[int] | None = None,
    ) -> int:
        """
        Compare (camera_id, track_id) features against every track that
        is a confirmed weapon holder.  Returns the best-matching global ID
        if similarity exceeds threshold, or -1.

        Only entries in _weapon_holder_keys are searched — this prevents
        innocent bystanders from snowballing into the same global ID.

        Args:
            min_history: minimum number of feature vectors required before
                attempting a match — prevents noisy single-frame false positives.
            active_track_ids: track IDs currently visible on camera_id.  Any
                gallery entry whose track is still active (and is not the query
                track itself) is skipped — a global ID already held by a person
                in the current frame cannot be re-assigned to a different person.
        """
        history = self.camera_features.get(camera_id, {}).get(track_id)
        if not history or len(history) < min_history:
            return -1

        feat = self.get_averaged_features(camera_id, track_id)
        if feat is None:
            return -1

        best_sim = threshold
        best_gid = -1
        for (cam, tid) in self._weapon_holder_keys:
            gid = self.global_person_ids.get((cam, tid))
            if gid is None:
                continue
            if cam == camera_id and tid == track_id:
                continue
            # Skip gallery entries whose owner is still visible in this frame
            if cam == camera_id and active_track_ids and tid in active_track_ids:
                continue
            other = self.get_averaged_features(cam, tid)
            if other is None:
                continue
            sim = self.cosine_similarity(feat, other)
            if sim > best_sim:
                best_sim = sim
                best_gid = gid
        return best_gid

    def assign_global_ids(
        self, matches: dict[tuple[int, int], dict]
    ) -> None:
        """
        Incrementally assign stable global IDs.

        - Cross-camera matched pairs share an ID, reusing any existing ID.
        - Unmatched tracks are compared against the full gallery before
          getting a fresh ID (enables within-camera re-identification).
        """
        visited: set[tuple[int, int]] = set()

        # Cross-camera matched pairs — reuse existing ID if one side has one
        for (cam, track), info in matches.items():
            if (cam, track) in visited:
                continue
            m_cam, m_track = info["camera"], info["track"]
            gid = self.global_person_ids.get(
                (cam, track),
                self.global_person_ids.get((m_cam, m_track), -1),
            )
            if gid < 0:
                gid = self._next_global_id
                self._next_global_id += 1
            self.global_person_ids[(cam, track)] = gid
            self.global_person_ids[(m_cam, m_track)] = gid
            visited.add((cam, track))
            visited.add((m_cam, m_track))

        # Unmatched tracks: feature-match against gallery, else fresh ID
        for cam in self.camera_features:
            for track in self.camera_features[cam]:
                if (cam, track) in self.global_person_ids:
                    continue
                gid = self._find_gallery_match(cam, track)
                if gid < 0:
                    gid = self._next_global_id
                    self._next_global_id += 1
                self.global_person_ids[(cam, track)] = gid

    # ------------------------------------------------------------------
    # Accessors for visualisation
    # ------------------------------------------------------------------
    def get_global_id(self, camera_id: int, track_id: int) -> int:
        """Return the global person ID for a track, or -1 if unknown."""
        return self.global_person_ids.get((camera_id, track_id), -1)

    def get_color_for_track(
        self, camera_id: int, track_id: int
    ) -> tuple[int, int, int]:
        """Return a consistent BGR colour tied to the track's global ID."""
        gid = self.get_global_id(camera_id, track_id)
        idx = gid % len(self._colours) if gid >= 0 else 0
        return self._colours[idx]
