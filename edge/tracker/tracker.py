"""
edge/tracker/tracker.py

Thin wrapper around Ultralytics ByteTrack.

Primary path  : detector calls update_from_yolo() with pre-computed ByteTrack
                IDs from yolo_model.track() — no matching is done here.

Fallback path : update() runs a greedy IoU-overlap matcher used for unit tests
                or when YOLO is unavailable.  Matching is based entirely on
                bounding-box IoU (intersection-over-union), NOT on Euclidean
                distance between centres.
"""

from __future__ import annotations

import numpy as np


# ---------------------------------------------------------------------------
# Track
# ---------------------------------------------------------------------------
class Track:
    """One active track returned by ByteTrack."""

    def __init__(self, track_id: int, bbox: np.ndarray, confidence: float) -> None:
        self.track_id:  int        = track_id
        self.bbox:      np.ndarray = np.asarray(bbox, dtype=float)  # [x1,y1,x2,y2]
        self.confidence: float     = confidence

    def __repr__(self) -> str:
        return f"Track(id={self.track_id}, bbox={self.bbox})"


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------
class Tracker:
    """
    ByteTrack wrapper used by detector.py.

    Matching metric
    ---------------
    Both paths use **IoU overlap** (intersection-over-union of bounding boxes)
    as the sole similarity metric — no Euclidean centre-distance is used.

    update_from_yolo()
        Receives boxes + track IDs already assigned by Ultralytics ByteTrack
        (which uses IoU internally, configured via tracker/bytetrack.yaml).
        No matching is performed here; tracks are constructed directly.

    update()  [fallback / standalone]
        Greedy IoU assignment: sorts all (prev_track, new_detection) pairs by
        IoU descending, greedily assigns the highest-overlap pairs first.
        Any pair whose IoU < ``iou_threshold`` is discarded, and the
        unmatched detection becomes a new track.
    """

    def __init__(self, iou_threshold: float = 0.15) -> None:
        """
        Parameters
        ----------
        iou_threshold : float
            Minimum IoU overlap required to match a detection to an existing
            track.  0.15 is intentionally low to handle small, fast-moving
            objects (knives).  False links are suppressed by the weapon
            ownership state machine upstream.
        """
        self.tracks: list[Track] = []
        self.iou_threshold = iou_threshold

        # Fallback state
        self._next_id:    int          = 1
        self._prev_tracks: list[Track] = []

    # ------------------------------------------------------------------
    # Primary path — called by detector after yolo_model.track()
    # ------------------------------------------------------------------
    def update_from_yolo(
        self,
        boxes_xyxy:  np.ndarray,   # (N, 4)
        track_ids:   np.ndarray,   # (N,)  int
        confidences: np.ndarray,   # (N,)  float
    ) -> None:
        """Populate tracks directly from YOLO ByteTrack output (no matching)."""
        self.tracks = [
            Track(int(tid), box, float(conf))
            for box, tid, conf in zip(boxes_xyxy, track_ids, confidences)
        ]

    # ------------------------------------------------------------------
    # Fallback path — standalone / unit tests
    # ------------------------------------------------------------------
    def update(self, frame: np.ndarray, detections: np.ndarray) -> None:
        """
        Greedy IoU-overlap tracker.

        Parameters
        ----------
        detections : np.ndarray  shape (N, 5)  [x1, y1, x2, y2, conf]
                     or a Python list of the same rows.
        """
        if not isinstance(detections, np.ndarray):
            detections = np.array(detections)

        if detections.ndim != 2 or detections.shape[1] < 5 or len(detections) == 0:
            self.tracks = []
            self._prev_tracks = []
            return

        new_boxes = detections[:, :4]
        new_confs = detections[:, 4]

        if not self._prev_tracks:
            # First frame — assign fresh IDs
            self.tracks = [
                Track(self._next_id + i, box, float(conf))
                for i, (box, conf) in enumerate(zip(new_boxes, new_confs))
            ]
            self._next_id += len(new_boxes)
            self._prev_tracks = list(self.tracks)
            return

        prev_boxes  = np.array([t.bbox for t in self._prev_tracks])
        iou_matrix  = _iou_matrix(prev_boxes, new_boxes)

        matched_prev: set[int] = set()
        matched_new:  set[int] = set()
        new_tracks:   list[Track] = []

        # Sort all (prev_idx, new_idx) pairs by IoU descending, then greedily assign
        pairs = sorted(
            [
                (i, j, iou_matrix[i, j])
                for i in range(len(self._prev_tracks))
                for j in range(len(new_boxes))
            ],
            key=lambda x: -x[2],
        )

        for i, j, iou in pairs:
            if iou < self.iou_threshold:
                break   # remaining pairs are all below threshold (sorted desc)
            if i in matched_prev or j in matched_new:
                continue
            matched_prev.add(i)
            matched_new.add(j)
            new_tracks.append(
                Track(self._prev_tracks[i].track_id, new_boxes[j], float(new_confs[j]))
            )

        # Unmatched detections → new IDs
        for j in range(len(new_boxes)):
            if j not in matched_new:
                new_tracks.append(Track(self._next_id, new_boxes[j], float(new_confs[j])))
                self._next_id += 1

        self.tracks = new_tracks
        self._prev_tracks = list(self.tracks)


# ---------------------------------------------------------------------------
# IoU helpers  (module-level so they can be tested independently)
# ---------------------------------------------------------------------------
def _iou(box_a: np.ndarray, box_b: np.ndarray) -> float:
    """Intersection-over-Union of two [x1, y1, x2, y2] boxes."""
    xa1, ya1, xa2, ya2 = box_a
    xb1, yb1, xb2, yb2 = box_b

    ix1 = max(xa1, xb1);  iy1 = max(ya1, yb1)
    ix2 = min(xa2, xb2);  iy2 = min(ya2, yb2)

    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, xa2 - xa1) * max(0.0, ya2 - ya1)
    area_b = max(0.0, xb2 - xb1) * max(0.0, yb2 - yb1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """Return (M, N) IoU matrix for M boxes_a against N boxes_b."""
    m, n = len(boxes_a), len(boxes_b)
    mat  = np.zeros((m, n), dtype=float)
    for i in range(m):
        for j in range(n):
            mat[i, j] = _iou(boxes_a[i], boxes_b[j])
    return mat
