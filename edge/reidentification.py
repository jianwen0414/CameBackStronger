"""
edge/reidentification.py
Person Re-Identification using OSNet (torchreid).

Responsibilities:
  - Extract 512-dim feature vectors from person crops (OSNet)
  - Store per-camera, per-track feature history (rolling average)
  - Find cross-camera matches via cosine similarity
  - Assign stable global person IDs across cameras
  - Provide consistent colours per global ID for visualisation

Install:
    pip install torchreid
    # or: pip install git+https://github.com/KaiyangZhou/deep-person-reid.git
"""

from __future__ import annotations

import numpy as np
import cv2
from collections import defaultdict

try:
    import torch
    import torchreid
    REID_AVAILABLE = True
except ImportError:
    REID_AVAILABLE = False


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FEATURE_HISTORY_LEN = 10   # Rolling window of feature vectors per track
REID_INPUT_W        = 128  # OSNet expected width
REID_INPUT_H        = 256  # OSNet expected height


# ---------------------------------------------------------------------------
# PersonReID
# ---------------------------------------------------------------------------
class PersonReID:
    """
    In-memory person re-identification across multiple cameras.

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

    def __init__(self, model_name: str = "osnet_x1_0", device: str = "cpu") -> None:
        if not REID_AVAILABLE:
            raise ImportError(
                "torchreid is not installed. "
                "Run: pip install git+https://github.com/KaiyangZhou/deep-person-reid.git"
            )

        self.device = device

        print(f"[ReID] Loading OSNet model: {model_name} on {device} ...")
        self.feature_extractor = torchreid.utils.FeatureExtractor(
            model_name=model_name,
            model_path=None,
            device=device,
        )
        print("[ReID] ✓ OSNet loaded.")

        # {camera_id: {track_id: [feature_vector, ...]}}
        self.camera_features: dict[int, dict[int, list[np.ndarray]]] = (
            defaultdict(lambda: defaultdict(list))
        )

        # {(camera_id, track_id): global_person_id}
        self.global_person_ids: dict[tuple[int, int], int] = {}
        self._next_global_id: int = 1

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
    def _preprocess_crop(self, crop: np.ndarray) -> np.ndarray | None:
        """Resize and convert a BGR crop to RGB (H=256, W=128)."""
        if crop is None or crop.size == 0:
            return None
        if crop.shape[0] < 10 or crop.shape[1] < 10:
            # Too small — OSNet will produce garbage features
            return None
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        return cv2.resize(rgb, (REID_INPUT_W, REID_INPUT_H))

    def extract_features(self, crop: np.ndarray) -> np.ndarray | None:
        """
        Extract a L2-normalised 512-dim feature vector from a person crop.
        Returns None if the crop is invalid.
        """
        preprocessed = self._preprocess_crop(crop)
        if preprocessed is None:
            return None

        import torch
        with torch.no_grad():
            feats = self.feature_extractor([preprocessed])

        feats = feats.cpu().numpy()[0]
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
            for cam2 in camera_ids[i + 1 :]:
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
    def assign_global_ids(
        self, matches: dict[tuple[int, int], dict]
    ) -> None:
        """
        Assign a shared global ID to matched tracks and unique IDs to
        unmatched tracks.  Call this after find_cross_camera_matches().
        """
        self.global_person_ids = {}
        current_global_id = 1
        visited: set[tuple[int, int]] = set()

        # Matched pairs get the same ID
        for (cam, track), info in matches.items():
            if (cam, track) in visited:
                continue
            m_cam, m_track = info["camera"], info["track"]
            self.global_person_ids[(cam, track)] = current_global_id
            self.global_person_ids[(m_cam, m_track)] = current_global_id
            visited.add((cam, track))
            visited.add((m_cam, m_track))
            current_global_id += 1

        # Unmatched tracks each get their own ID
        for cam in self.camera_features:
            for track in self.camera_features[cam]:
                if (cam, track) not in self.global_person_ids:
                    self.global_person_ids[(cam, track)] = current_global_id
                    current_global_id += 1

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
