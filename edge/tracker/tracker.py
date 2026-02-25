"""
edge/tracker/tracker.py
Thin wrapper around Ultralytics ByteTrack.

The existing detector.py calls:
    tracker.update(frame, detections)  →  populates tracker.tracks
    track.track_id                     →  stable integer ID
    track.bbox                         →  (x1, y1, x2, y2) float array

All of that is satisfied here.  YOLO's internal ByteTrack does the heavy
lifting; this class just keeps a consistent interface so the detector
doesn't need to import ultralytics directly for tracking.
"""

from __future__ import annotations

import numpy as np


# ---------------------------------------------------------------------------
# Lightweight Track object
# ---------------------------------------------------------------------------
class Track:
    """Represents one active track returned by ByteTrack."""

    def __init__(self, track_id: int, bbox: np.ndarray, confidence: float) -> None:
        self.track_id: int = track_id
        self.bbox: np.ndarray = bbox          # [x1, y1, x2, y2]
        self.confidence: float = confidence

    @property
    def center(self) -> tuple[float, float]:
        x1, y1, x2, y2 = self.bbox
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    def __repr__(self) -> str:
        return f"Track(id={self.track_id}, bbox={self.bbox})"


# ---------------------------------------------------------------------------
# Tracker — ByteTrack via Ultralytics
# ---------------------------------------------------------------------------
class Tracker:
    """
    ByteTrack wrapper that mirrors the API expected by LuggageDetector /
    WeaponDetector in detector.py.

    Usage::

        tracker = Tracker()
        # detections: np.ndarray of shape (N, 5) — [x1, y1, x2, y2, conf]
        tracker.update(frame, detections)
        for track in tracker.tracks:
            print(track.track_id, track.bbox)

    Implementation note
    -------------------
    Ultralytics exposes ByteTrack through ``YOLO.track()``.  However,
    since the detector already runs ``YOLO.track()`` on every frame and
    gets back ``boxes.id`` + ``boxes.xyxy``, the easiest approach is to
    let the detector pass those results in directly rather than running
    the model a second time.

    For cases where the Tracker is used standalone (e.g. tests), it falls
    back to a simple IoU-based greedy tracker so the interface still works
    without a GPU / model file.
    """

    def __init__(self) -> None:
        self.tracks: list[Track] = []
        # Fallback simple tracker state
        self._next_id: int = 1
        self._prev_tracks: list[Track] = []

    # ------------------------------------------------------------------
    # Primary update path  (called by detector after YOLO inference)
    # ------------------------------------------------------------------
    def update_from_yolo(
        self,
        boxes_xyxy: np.ndarray,   # (N, 4)
        track_ids: np.ndarray,    # (N,)  int
        confidences: np.ndarray,  # (N,)  float
    ) -> None:
        """
        Populate self.tracks directly from YOLO's ByteTrack output.
        This is the normal path used inside detector.py.
        """
        self.tracks = [
            Track(int(tid), box, float(conf))
            for box, tid, conf in zip(boxes_xyxy, track_ids, confidences)
        ]

    # ------------------------------------------------------------------
    # Fallback update path  (standalone use / unit tests)
    # ------------------------------------------------------------------
    def update(self, frame: np.ndarray, detections: np.ndarray) -> None:
        """
        Greedy IoU tracker — used when YOLO is not available.

        detections: np.ndarray shape (N, 5) [x1, y1, x2, y2, conf]
                    OR a Python list of the same rows.
        """
        if not isinstance(detections, np.ndarray):
            detections = np.array(detections)

        if detections.ndim != 2 or detections.shape[1] < 5 or len(detections) == 0:
            # No detections this frame — keep existing tracks briefly
            # (a real ByteTrack would use the track_buffer; we just clear)
            self.tracks = []
            self._prev_tracks = []
            return

        new_boxes = detections[:, :4]
        new_confs = detections[:, 4]

        if not self._prev_tracks:
            # First frame — assign fresh IDs to all detections
            self.tracks = [
                Track(self._next_id + i, box, float(conf))
                for i, (box, conf) in enumerate(zip(new_boxes, new_confs))
            ]
            self._next_id += len(new_boxes)
            self._prev_tracks = list(self.tracks)
            return

        # Greedy IoU assignment
        prev_boxes = np.array([t.bbox for t in self._prev_tracks])
        iou_matrix = self._iou_matrix(prev_boxes, new_boxes)

        matched_prev: set[int] = set()
        matched_new: set[int] = set()
        new_tracks: list[Track] = []

        # Sort (prev, new) pairs by IoU descending
        pairs = sorted(
            [(i, j, iou_matrix[i, j]) for i in range(len(self._prev_tracks))
             for j in range(len(new_boxes))],
            key=lambda x: -x[2],
        )

        for i, j, iou in pairs:
            if iou < 0.3:
                break
            if i in matched_prev or j in matched_new:
                continue
            matched_prev.add(i)
            matched_new.add(j)
            new_tracks.append(
                Track(self._prev_tracks[i].track_id, new_boxes[j], float(new_confs[j]))
            )

        # Unmatched new detections → new IDs
        for j in range(len(new_boxes)):
            if j not in matched_new:
                new_tracks.append(
                    Track(self._next_id, new_boxes[j], float(new_confs[j]))
                )
                self._next_id += 1

        self.tracks = new_tracks
        self._prev_tracks = list(self.tracks)

    # ------------------------------------------------------------------
    # IoU helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _iou(box_a: np.ndarray, box_b: np.ndarray) -> float:
        xa1, ya1, xa2, ya2 = box_a
        xb1, yb1, xb2, yb2 = box_b

        ix1 = max(xa1, xb1)
        iy1 = max(ya1, yb1)
        ix2 = min(xa2, xb2)
        iy2 = min(ya2, yb2)

        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        area_a = max(0.0, xa2 - xa1) * max(0.0, ya2 - ya1)
        area_b = max(0.0, xb2 - xb1) * max(0.0, yb2 - yb1)
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    @classmethod
    def _iou_matrix(
        cls, boxes_a: np.ndarray, boxes_b: np.ndarray
    ) -> np.ndarray:
        m, n = len(boxes_a), len(boxes_b)
        mat = np.zeros((m, n), dtype=float)
        for i in range(m):
            for j in range(n):
                mat[i, j] = cls._iou(boxes_a[i], boxes_b[j])
        return mat
